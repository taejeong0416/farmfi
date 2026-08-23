// ── 적용된 설정점을 판정 기준으로 ────────────────────────────────────────────
//
// 9.2 최적대 판정과 9.5 목표 DLI가 지금까지 `crop-profiles`의 **문헌값**만 봤다.
// 학습 스택이 매장별 최적점을 내놓아도 판정은 그걸 몰랐다 — 모델이 "이 매장은
// 21.4℃가 최적"이라 해도 상추 문헌값 18~24를 그대로 썼다는 뜻이다.
//
// 이 모듈이 그 둘을 잇는다. 원칙은 봉투와 같다.
//
//   **학습은 좁힐 수만 있고 넓힐 수 없다.**
//
// 적용된 설정점을 중심으로 최적대를 좁히되, 문헌 범위 밖으로는 절대 못 나간다.
// 봉투가 이미 적용값을 문헌 범위 안에 가둬 놨으므로 결과는 항상 부분집합이다.
// 그리고 **고장 게이트는 건드리지 않는다** — 물리 한계는 학습의 대상이 아니다.

import { getCrop } from "./crop-profiles";

/** 판정에 쓰는 요인 — IoT 판독 키와 레시피 요인명을 잇는다. */
const FEATURE_TO_SENSOR: Record<string, string> = {
  temp: "temperature",
  humidity: "humidity",
  co2: "co2Level",
  ph: "phLevel",
};

/**
 * 적용값을 중심으로 잡는 최적대의 반폭. 문헌 범위 폭에 대한 비율이다.
 *
 * 0.5면 문헌 범위의 절반 폭으로 좁힌다 — 적용값이 맞다면 그 근처에 머물러야
 * 하고, 벗어나면 "설정대로 운전되지 않고 있다"는 신호다. 너무 좁히면 정상
 * 변동에도 경보가 뜨므로 절반에서 시작한다.
 */
const NARROW_RATIO = 0.5;

export interface AppliedDecision {
  feature: string;
  applied: number;
  verdict: string;
}

export interface DerivedRanges {
  /** 센서키 → 최적대. 문헌 범위를 넘지 않는다 */
  optimal: Record<string, [number, number]>;
  /** 목표 DLI. 적용된 값이 없으면 문헌값 */
  dliTarget: number;
  /** 학습값에서 좁혀진 요인 목록 — 화면이 "왜 기준이 다른가"를 답할 수 있게 */
  narrowed: string[];
  source: "applied" | "literature";
}

/**
 * 적용된 설정점에서 판정 기준을 만든다.
 *
 * @param decisions `SetpointApplication.decisions`. 없거나 비면 문헌값 그대로.
 *   `APPLIED`가 아닌 요인은 쓰지 않는다 — 규칙이 조정하거나 거부한 값은
 *   "이 매장의 최적"이라 부를 수 없다.
 */
export function deriveRanges(
  cropKey: string | undefined,
  decisions: AppliedDecision[] | null | undefined,
): DerivedRanges {
  const crop = getCrop(cropKey);
  const literature = crop.healthyRanges as unknown as Record<string, [number, number]>;
  const optimal: Record<string, [number, number]> = { ...literature };
  const narrowed: string[] = [];
  let dliTarget = crop.dliTarget;

  if (!decisions || decisions.length === 0) {
    return { optimal, dliTarget, narrowed, source: "literature" };
  }

  for (const d of decisions) {
    // 규칙이 손댄 값은 최적이 아니다. 클램프된 값을 최적대 중심으로 삼으면
    // "규칙이 잘라낸 자리"를 목표라고 부르게 된다.
    if (d.verdict !== "APPLIED") continue;
    if (!Number.isFinite(d.applied)) continue;

    if (d.feature === "dli") {
      dliTarget = d.applied;
      narrowed.push("dli");
      continue;
    }

    const sensor = FEATURE_TO_SENSOR[d.feature];
    if (!sensor) continue;
    const lit = literature[sensor];
    if (!lit) continue;

    const half = ((lit[1] - lit[0]) * NARROW_RATIO) / 2;
    // 문헌 범위 밖으로 나가지 않는다. 학습이 넓히지 못한다는 원칙이 여기서 선다.
    const lo = Math.max(lit[0], d.applied - half);
    const hi = Math.min(lit[1], d.applied + half);
    if (hi > lo) {
      optimal[sensor] = [lo, hi];
      narrowed.push(d.feature);
    }
  }

  return {
    optimal,
    dliTarget,
    narrowed,
    source: narrowed.length > 0 ? "applied" : "literature",
  };
}
