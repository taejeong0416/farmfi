// ── 설정점 봉투 ──────────────────────────────────────────────────────────────
// 학습된 레시피가 낸 목표 설정점을 그대로 설비에 넘기지 않는다. 결정론적 규칙이
// 먼저 판단하고, 규칙이 허용한 범위 **안에서만** 학습 산출을 쓴다.
//
// 순서가 핵심이다.
//   ① 규칙이 먼저 — 반응면이 안장이거나 최적점이 탐색 경계에 붙었으면 산출을 버린다
//   ② 통과한 값만 — 농학 범위·설비 정격·광주기·변화폭으로 좁힌다
//   ③ 학습은 좁힐 수만 있다 — 규칙이 허용한 폭을 넓히지 못한다
//
// 왜 필요한가. 이 설정점은 물 몇 ml가 아니라 자금 집행으로 이어진다.
// 설정점 → 설비 운전 → IoT 가동률 → 마일스톤 2·4단계 판정 → 트랜치 집행.
// 레시피가 이상한 값을 내면 멀쩡한 운영자가 돈을 못 받거나, 무리한 운전으로
// 설비가 상한 채 가동률만 채워진다. 그래서 마지막 결정은 규칙이 갖는다.
//
// 산출값과 적용값을 **둘 다** 남긴다. 나중에 "모델은 뭐라 했고 우리는 뭘 했나"를
// 대조할 수 없으면 모델을 고칠 근거도 사라진다.

import { getCrop, type CropProfile } from "./crop-profiles";
import type { GrowthRecipe, RecipeSetpoint, SurfaceVerdict } from "./growth-recipe";

/** 한 요인에 대한 판정. 실패가 boolean 하나면 "왜"가 사라진다. */
export type EnvelopeVerdict =
  /** 산출값을 그대로 적용 */
  | "APPLIED"
  /** 농학 최적대 밖 → 경계로 잘림 */
  | "CLAMPED_AGRONOMIC"
  /** 설비 정격 밖 → 경계로 잘림 (LED 정격 등) */
  | "CLAMPED_EQUIPMENT"
  /** 하루 변화폭 초과 → 허용 폭까지만 이동 */
  | "CLAMPED_RATE"
  /** 반응면이 안장·판정불가 → 산출을 믿지 않고 현행 유지 */
  | "REJECTED_SURFACE"
  /** 최적점이 탐색 경계에 붙음 → "여기까지밖에 못 봤다"는 뜻이라 채택하지 않는다 */
  | "REJECTED_BOUNDARY"
  /** 곡률이 잡히지 않음 → 이 요인에는 최적점이라 부를 것이 없다 */
  | "REJECTED_CURVATURE"
  /** 값이 숫자가 아니다 (적합 실패·결측) */
  | "REJECTED_INVALID";

export interface EnvelopeDecision {
  feature: string;
  label: string;
  unit: string;
  /** 레시피가 낸 값 */
  proposed: number | null;
  /** 실제로 적용할 값 */
  applied: number;
  /** 직전 적용값. 없으면 null(첫 적용) */
  baseline: number | null;
  verdict: EnvelopeVerdict;
  /** 사람이 읽는 사유. 화면과 감사 로그가 그대로 쓴다 */
  reason: string;
  /** 이 요인에 걸린 허용 구간 */
  bounds: [number, number];
}

export interface EnvelopeResult {
  cropKey: string;
  decisions: EnvelopeDecision[];
  /** 하나라도 산출을 채택했나. 전부 거부면 레시피를 적용할 이유가 없다 */
  anyApplied: boolean;
  /** 규칙이 산출을 손댄 요인 수 */
  adjusted: number;
  note: string;
}

/**
 * 하루에 움직일 수 있는 폭. 급변은 그 자체로 스트레스이고, 원인 분석도 어렵게 한다
 * (무엇이 수율을 바꿨는지 요인이 뒤섞인다). 요인마다 감수성이 다르다.
 * 비율은 요인의 허용 구간 폭 기준이다.
 */
const MAX_DAILY_MOVE: Record<string, number> = {
  temp: 0.15,
  humidity: 0.2,
  co2: 0.25, // 기체는 빠르게 되돌릴 수 있다
  ec: 0.1, // 양액은 뿌리가 적응할 시간이 필요하다
  ph: 0.08, // 가장 민감하다 — 과보정이 회복을 더 어렵게 한다
  dli: 0.15,
};

/**
 * 요인별 허용 구간. crop-profiles가 정본이다 — 기준이 두 벌이면 하나만 고쳐진다.
 * DLI는 `dliTarget` 하나뿐이라 권장 폭(±20%)을 두되 LED 정격을 넘지 않게 한다.
 */
export function envelopeBounds(
  feature: string,
  crop: CropProfile,
): [number, number] | null {
  switch (feature) {
    case "temp":
      return crop.healthyRanges.temperature;
    case "humidity":
      return crop.healthyRanges.humidity;
    case "co2":
      return crop.healthyRanges.co2Level;
    case "ph":
      return crop.healthyRanges.phLevel;
    case "ec":
      return crop.ecTarget;
    case "dli": {
      const t = crop.dliTarget;
      // 설비가 하루에 낼 수 있는 최대 DLI — 정격 PPFD를 최대 명기 동안 켠 값.
      // 이걸 넘는 목표는 물리적으로 달성 불가라 가동률만 떨어뜨린다.
      const ceiling = (crop.maxPpfd * crop.maxPhotoperiodH * 3600) / 1e6;
      return [t * 0.8, Math.min(t * 1.2, ceiling)];
    }
    default:
      return null;
  }
}

/** DLI 상한이 설비 정격에서 왔는지 (그러면 사유가 달라진다) */
function dliCeilingBinds(crop: CropProfile): boolean {
  const ceiling = (crop.maxPpfd * crop.maxPhotoperiodH * 3600) / 1e6;
  return ceiling < crop.dliTarget * 1.2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, feature: string): number {
  // 표시 단위에 맞춘 반올림. ppm까지 소수점을 끌고 다닐 이유가 없다.
  const digits = feature === "co2" ? 0 : feature === "ph" || feature === "ec" ? 2 : 1;
  return Number(v.toFixed(digits));
}

/**
 * 레시피 산출을 봉투에 통과시킨다.
 *
 * @param recipe 학습 결과. `surface`가 최대점이 아니면 요인별 값을 채택하지 않는다.
 * @param baseline 직전에 **적용한** 값. 산출값이 아니다 — 변화폭은 실제 운전점 기준이어야 한다.
 */
export function applyEnvelope(
  recipe: Pick<GrowthRecipe, "recipe" | "surface" | "samples">,
  opts?: { cropKey?: string; baseline?: Record<string, number> },
): EnvelopeResult {
  const crop = getCrop(opts?.cropKey);
  const baseline = opts?.baseline ?? {};
  const surfaceOk = recipe.surface === "최대점";

  const decisions: EnvelopeDecision[] = [];

  for (const sp of recipe.recipe) {
    const bounds = envelopeBounds(sp.feature, crop);
    if (!bounds) continue; // 봉투가 정의되지 않은 요인은 자동 적용 대상이 아니다

    const [lo, hi] = bounds;
    const prev = Number.isFinite(baseline[sp.feature]) ? baseline[sp.feature] : null;
    // 산출을 못 쓰면 직전 적용값을 유지하고, 그것도 없으면 구간 중앙에 선다.
    const fallback = prev ?? (lo + hi) / 2;

    const push = (verdict: EnvelopeVerdict, applied: number, reason: string) =>
      decisions.push({
        feature: sp.feature,
        label: sp.label,
        unit: sp.unit,
        proposed: Number.isFinite(sp.optimum) ? round(sp.optimum, sp.feature) : null,
        applied: round(applied, sp.feature),
        baseline: prev,
        verdict,
        reason,
        bounds: [round(lo, sp.feature), round(hi, sp.feature)],
      });

    if (!Number.isFinite(sp.optimum)) {
      push("REJECTED_INVALID", fallback, "산출값이 없습니다. 현행 설정을 유지합니다.");
      continue;
    }
    if (!surfaceOk) {
      push(
        "REJECTED_SURFACE",
        fallback,
        `반응면이 ${recipe.surface}입니다. 최적점이라 부를 수 없어 채택하지 않습니다.`,
      );
      continue;
    }
    if (sp.atBoundary) {
      push(
        "REJECTED_BOUNDARY",
        fallback,
        "최적점이 관측 범위 끝에 붙었습니다. 더 좋은 값이 밖에 있을 수 있어 채택하지 않습니다.",
      );
      continue;
    }
    if (sp.curvatureUnresolved) {
      push(
        "REJECTED_CURVATURE",
        fallback,
        "관측이 이 요인의 곡률을 잡지 못했습니다. 꼭짓점이 없으니 최적점이라 부를 값도 없습니다.",
      );
      continue;
    }

    // ① 농학·설비 범위
    let applied = clamp(sp.optimum, lo, hi);
    let verdict: EnvelopeVerdict = "APPLIED";
    let reason = "산출값을 그대로 적용합니다.";

    if (applied !== sp.optimum) {
      const equipmentBound = sp.feature === "dli" && dliCeilingBinds(crop) && sp.optimum > hi;
      verdict = equipmentBound ? "CLAMPED_EQUIPMENT" : "CLAMPED_AGRONOMIC";
      reason = equipmentBound
        ? `설비가 낼 수 있는 최대 광량(${round(hi, "dli")}${sp.unit})을 넘어 상한으로 맞췄습니다.`
        : `${crop.label} 정상범위 ${round(lo, sp.feature)}~${round(hi, sp.feature)}${sp.unit} 밖이라 경계로 맞췄습니다.`;
    }

    // ② 하루 변화폭 — 직전 적용값이 있을 때만 건다. 첫 적용은 제한할 기준이 없다.
    const rate = MAX_DAILY_MOVE[sp.feature];
    if (prev !== null && rate) {
      const span = (hi - lo) * rate;
      const capped = clamp(applied, prev - span, prev + span);
      if (Math.abs(capped - applied) > 1e-9) {
        applied = capped;
        // 범위 클램프보다 변화폭 클램프를 사유로 남긴다 — 실제로 값을 정한 쪽이 이쪽이다.
        verdict = "CLAMPED_RATE";
        reason = `하루 변화폭 ${round(span, sp.feature)}${sp.unit}을 넘어 그만큼만 옮겼습니다. 다음 주기에 이어서 접근합니다.`;
      }
    }

    push(verdict, applied, reason);
  }

  const anyApplied = decisions.some((d) => d.verdict === "APPLIED");
  const adjusted = decisions.filter((d) => d.verdict !== "APPLIED").length;

  const note = !surfaceOk
    ? `반응면 판정이 ${recipe.surface}이라 학습 산출을 적용하지 않았습니다. 관측이 더 쌓여야 합니다.`
    : adjusted === 0
      ? "산출값이 모두 허용 범위 안에 있습니다."
      : `${decisions.length}개 중 ${adjusted}개를 규칙이 조정했습니다.`;

  return { cropKey: crop.key, decisions, anyApplied, adjusted, note };
}

/** 적용 결과를 제어 루프가 받는 형태로 옮긴다. 봉투를 통과하지 않은 값은 여기 오지 않는다. */
export function toSetpointMap(result: EnvelopeResult): Record<string, number> {
  return Object.fromEntries(result.decisions.map((d) => [d.feature, d.applied]));
}
