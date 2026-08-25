// ── AI 생육레시피 분석 — 고도화 ─────────────────────────────────────────────
// 기본 버전(growth-recipe.ts)이 하나의 표면에서 최적점 하나를 낸다면, 여기서는
// 그 최적점이 얼마나 믿을 만한지와, 그 믿음을 어디서 빌려왔는지를 다룬다.
//   · 부트스트랩 → 계층 베이지안         → 최적점의 실제 불확실성과 출처 배분
//   · 사후분산 기반 실험 제안            → 다음에 무엇을 시험하면 가장 많이 배우나
//
// 사전 정밀도를 표본 수의 함수로 두면(seTheta = sd·√(20/n)) 잡음이 전혀 다른 두
// 데이터셋이 같은 가중치를 받는다. 그래서 불확실성은 데이터에서 직접 잰다 —
// 관측을 복원추출해 표면을 다시 적합하고 최적점 분포의 산포를 본다.
//
// 계층은 3층이다. 문헌(농학 사전) → 같은 사이트의 다른 품종 → 이 품종의 자체 데이터.
// 가운데 층이 "품종이 바뀌면 리셋인가 승계인가"에 답한다 — 이전 강도가 연속량이라
// 둘 중 하나를 고를 필요가 없다.

import {
  GrowthObservation,
  analyzeGrowthRecipe,
  fitResponseSurface,
  optimumZ,
  curvatureUnresolved,
  zBounds,
  recipeGapAnalysis,
  FEATURES,
  FEATURE_LABEL,
  UNIT,
  predictSurface,
  observationWeights,
  type GrowthRecipe,
  type GrowthFeature,
  type SurfaceVerdict,
  type RecipeGapReport,
  type RecipeSensitivity,
} from "./growth-recipe";
import { toNormalized, fromNormalized, transferWeight } from "./crop-normalize";
import { LEAFY_SPEC, generateObservations } from "./growth-recipe-synth";
import { profitOptimalRecipe, type ProfitRecipe } from "./growth-recipe-profit";

// 정규화 좌표에서 농학 사전은 언제나 N(0, PRIOR_SD²)이다 — z=0이 문헌 최적,
// z=±1이 정상범위 경계라는 정의에서 바로 나온다. 폭을 0.5로 두는 건 "정상범위"를
// ±2σ(약 95%)로 읽는다는 뜻이다. ±1σ로 읽으면 문헌이 말한 범위 밖에 확률질량이
// 3분의 1이나 남아, 농학 지식을 실제보다 약하게 쓰게 된다.
const PRIOR_SD = 0.5;

// ── ① 부트스트랩으로 최적점의 실제 불확실성을 잰다 ──────────────────────────
// 관측을 복원추출해 표면을 다시 적합하고 최적점을 다시 찾는다. 그 분포의 산포가
// 곧 최적점의 표준오차다. 잡음이 크거나 곡률이 얕거나 최적점이 상자 끝에 붙으면
// 산포가 저절로 커진다 — 표본 수만 보는 공식으로는 셋 다 구분하지 못한다.
export interface BootstrapOptimum {
  /** 정규화 좌표에서의 최적점 평균 */
  meanZ: number[];
  /** 정규화 좌표에서의 표준오차 */
  seZ: number[];
  replicates: number;
}

function bootstrapOptimum(
  Z: number[][],
  y: number[],
  w: number[],
  clamp: boolean,
  replicates = 400,
  seed = 11
): BootstrapOptimum {
  const n = Z.length;
  const nF = FEATURES.length;
  // 탐색범위는 원표본으로 고정한다. 재표본마다 상자를 다시 잡으면 산포에
  // "상자가 흔들린 몫"이 섞여 최적점 자체의 불확실성이 아니게 된다.
  const bounds = zBounds(Z, clamp);

  // 곡률 게이트도 원표본으로 한 번 판정하고 모든 재표본에 같은 축을 고정한다.
  // 이걸 빼면 점추정은 "게이트 통과 후 조건부 최적점"이고 구간은 "게이트 없는
  // 최적점의 표집분포"라, 같은 양의 점추정과 구간이 아니게 된다. 실제로 그 차이가
  // EC에서 정상범위 반폭의 66%까지 벌어진다.
  const wSum = w.reduce((a, b) => a + b, 0) || 1;
  const zMeanW = FEATURES.map((_, i) => Z.reduce((s, z, k) => s + w[k] * z[i], 0) / wSum);
  const unresolved = curvatureUnresolved(Z, y, w);
  const pinned = unresolved.map((u, i) =>
    u ? Math.max(bounds[i][0], Math.min(bounds[i][1], zMeanW[i])) : null
  );

  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const draws: number[][] = [];
  for (let b = 0; b < replicates; b++) {
    const zi: number[][] = [];
    const yi: number[] = [];
    const wi: number[] = [];
    for (let k = 0; k < n; k++) {
      const j = Math.min(n - 1, Math.floor(rand() * n));
      zi.push(Z[j]);
      yi.push(y[j]);
      wi.push(w[j]);
    }
    const beta = fitResponseSurface(zi, yi, wi);
    const opt = optimumZ(beta, bounds, pinned);
    if (opt.every((v) => Number.isFinite(v))) draws.push(opt);
  }

  if (draws.length < 2) {
    return { meanZ: Array(nF).fill(0), seZ: Array(nF).fill(PRIOR_SD), replicates: draws.length };
  }
  const meanZ = Array.from({ length: nF }, (_, f) =>
    draws.reduce((acc, d) => acc + d[f], 0) / draws.length
  );
  const seZ = Array.from({ length: nF }, (_, f) =>
    Math.sqrt(draws.reduce((acc, d) => acc + (d[f] - meanZ[f]) ** 2, 0) / (draws.length - 1))
  );
  return { meanZ, seZ, replicates: draws.length };
}

// ── ② 계층 사전 — 문헌 → 다른 품종 → 이 품종 ────────────────────────────────
// 세 출처의 정밀도를 더한다. 가운데 층의 정밀도에 이전 강도 w를 곱하는 것이
// "품종이 바뀌면 리셋인가 승계인가"에 대한 답이다. w=1이면 완전 승계, w=0이면
// 리셋이고, 실제 값은 그 사이 어딘가다.
export interface SetpointSource {
  /** 문헌 / 다른 품종 이전 / 이 품종 자체가 각각 몇 %를 밀었나 */
  literature: number;
  transfer: number;
  own: number;
}

export interface HybridSetpoint {
  feature: string;
  label: string;
  unit: string;
  /** 이 품종 데이터만으로 본 최적점 (물리 단위) */
  dataOptimum: number | null;
  /** 문헌 최적 (물리 단위) */
  priorOptimum: number;
  /** 세 출처를 합친 권장 설정점 (물리 단위) */
  hybridOptimum: number;
  /** 권장값의 95% 구간 — 점이 아니라 폭으로 준다 */
  interval: [number, number];
  source: SetpointSource;
  /** 사후 평균·표준편차 (정규화 좌표) — 실험 제안이 이 좌표에서 움직인다 */
  muZ: number;
  sigPostZ: number;
}

export interface HybridRecipe {
  setpoints: HybridSetpoint[];
  note: string;
}

/**
 * @param obs 이 사이트의 관측. cropKey가 섞여 있어도 된다 — 다른 품종 행은
 *            이전 강도만큼만 반영된다.
 * @param cropKey 지금 레시피를 만들 품종
 */
export function agronomyInformedRecipe(
  obs: GrowthObservation[],
  cropKey?: string
): HybridRecipe {
  const target = cropKey ?? obs.find((o) => o.cropKey)?.cropKey ?? "leafy";
  const nF = FEATURES.length;

  // 품종별로 나눠 각각 자기 좌표계에서 최적점과 산포를 낸다
  const byCrop = new Map<string, GrowthObservation[]>();
  for (const o of obs) {
    const k = o.cropKey ?? target;
    byCrop.set(k, [...(byCrop.get(k) ?? []), o]);
  }

  const MIN_FIT = 24; // 파라미터 16개에 못 미치면 적합 자체가 성립하지 않는다
  const fits = new Map<string, BootstrapOptimum>();
  for (const [k, rows] of byCrop) {
    if (rows.length < MIN_FIT) continue;
    const Z = rows.map((o) => toNormalized(o, k));
    fits.set(
      k,
      bootstrapOptimum(Z, rows.map((o) => o.yield), observationWeights(rows), true)
    );
  }

  const own = fits.get(target) ?? null;
  const tau0 = 1 / (PRIOR_SD * PRIOR_SD);

  const muPost: number[] = [];
  const sigPost: number[] = [];
  const sources: SetpointSource[] = [];

  for (let f = 0; f < nF; f++) {
    const feature = FEATURES[f];
    // 문헌: z=0
    let tauSum = tau0;
    let weighted = 0; // Σ τ_i μ_i (문헌은 μ=0이라 기여가 0)
    let tauTransfer = 0;
    let tauOwn = 0;

    for (const [k, fit] of fits) {
      const se = fit.seZ[f];
      if (!Number.isFinite(se) || se <= 1e-6) continue;
      const tau = 1 / (se * se);
      if (k === target) {
        tauOwn += tau;
        tauSum += tau;
        weighted += tau * fit.meanZ[f];
      } else {
        // 정밀도에 이전 강도를 곱하기만 하면 강도가 "얼마나 빨리"만 정하고
        // "어디까지"를 정하지 못한다. 원 품종 데이터가 넉넉하면 w가 아무리 작아도
        // 문헌을 밀어내 버린다. 그래서 품종 불일치 자체를 분산으로 세운다 —
        // 다른 품종의 최적점은 이 품종의 최적점을 δ만큼 빗나가 관측한 값이다.
        //   δ(w) = PRIOR_SD·√(1/w − 1)
        // 원 데이터가 무한히 쌓여도(se→0) 이전이 가질 수 있는 비중은 정확히 w로
        // 수렴한다. 이전계수 0.21은 "최대 21%까지만 민다"는 뜻이 된다.
        const w = transferWeight(k, target, feature as GrowthFeature);
        if (w <= 0) continue;
        const delta2 = w >= 1 ? 0 : PRIOR_SD * PRIOR_SD * (1 / w - 1);
        const tw = 1 / (se * se + delta2);
        tauTransfer += tw;
        tauSum += tw;
        weighted += tw * fit.meanZ[f];
      }
    }

    muPost.push(weighted / tauSum);
    sigPost.push(1 / Math.sqrt(tauSum));
    const pct = (t: number) => Math.round((t / tauSum) * 100);
    sources.push({
      literature: pct(tau0),
      transfer: pct(tauTransfer),
      own: pct(tauOwn),
    });
  }

  const hybridPhys = fromNormalized(muPost, target);
  const priorPhys = fromNormalized(Array(nF).fill(0), target);
  const ownPhys = own ? fromNormalized(own.meanZ, target) : null;
  const loPhys = fromNormalized(muPost.map((m, f) => m - 1.96 * sigPost[f]), target);
  const hiPhys = fromNormalized(muPost.map((m, f) => m + 1.96 * sigPost[f]), target);
  const r2 = (v: number) => Math.round(v * 100) / 100;

  const setpoints: HybridSetpoint[] = FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    unit: UNIT[f],
    dataOptimum: ownPhys ? r2(ownPhys[f]) : null,
    priorOptimum: r2(priorPhys[f]),
    hybridOptimum: r2(hybridPhys[f]),
    interval: [r2(loPhys[f]), r2(hiPhys[f])],
    source: sources[i],
    muZ: Math.round(muPost[i] * 1000) / 1000,
    sigPostZ: Math.round(sigPost[i] * 1000) / 1000,
  }));

  const otherCrops = [...fits.keys()].filter((k) => k !== target);
  const avg = (pick: (s: SetpointSource) => number) =>
    Math.round(sources.reduce((s, x) => s + pick(x), 0) / nF);
  const transferPart = otherCrops.length
    ? ` 다른 품종(${otherCrops.join("·")})에서 ${avg((s) => s.transfer)}%를 이전받았다.`
    : "";

  return {
    setpoints,
    note:
      `설정점은 문헌 ${avg((s) => s.literature)}% · 이전 ${avg((s) => s.transfer)}% · ` +
      `자체 데이터 ${avg((s) => s.own)}%가 합쳐진 값이다.${transferPart} ` +
      `불확실성은 부트스트랩 ${own?.replicates ?? 0}회로 데이터에서 직접 쟀다 — ` +
      `표본 수뿐 아니라 잡음과 곡률이 함께 반영된다. 권장값은 점이 아니라 95% 구간으로 준다.`,
  };
}

// ── ③ 무작위 처리 배정 — 관측을 실험으로 바꾼다 ─────────────────────────────
// 사후 표준편차가 실제 데이터에서 나오므로, 아직 모르는 요인이 어느 쪽인지는
// 표본 수가 아니라 데이터가 정한다. 문제는 그다음이다.
//
// 최적점을 그대로 적용해 얻은 관측으로 다시 학습하면, 설정값이 계절·인력·품종과
// 함께 움직인 기록만 쌓인다. "온도를 올리면 수율이 오른다"는 개입 주장인데 근거는
// 관측이고, 둘을 갈라놓을 방법이 그 데이터 안에 없다.
//
// 그래서 매 사이클 요인 하나를 골라 무작위 방향으로 밀어서 적용한다. 무작위로
// 정해진 값은 정의상 계절과 독립이므로 교란이 끊긴다. 어느 요인을 고를지는 남은
// 불확실성에 비례시켜, 배울 게 많은 축이 더 자주 흔들리게 한다.
//
// 흔드는 값이 공짜여야 이게 성립한다. 최적점 근처에서 표면이 평평한 방향은
// 밀어도 수율이 거의 안 변한다. 예측 손실이 상한을 넘는 요인은 배정하지 않는다 —
// 기울어진 축은 탐색 대상이 아니라 그냥 옮길 대상이다.
export interface ExperimentSuggestion {
  label: string;
  suggestValue: number;
  unit: string;
  /** 이 실험으로 줄어들 것으로 보는 사후 표준편차 비율 */
  uncertaintyRatio: number;
  reason: string;
}

/** 이번 사이클에 실제로 적용할 무작위 처리 */
export interface ExperimentAssignment {
  feature: GrowthFeature;
  label: string;
  unit: string;
  /** 레시피가 낸 설정점 (물리 단위) */
  recipeValue: number;
  /** 무작위로 민 뒤 실제로 적용할 값 (물리 단위) */
  assignedValue: number;
  /** 적용값의 정규화 좌표 — 관측에 이 값을 표식으로 남긴다 */
  z: number;
  direction: "상향" | "하향";
  /** 이 흔들림으로 잃을 것으로 보는 예측 수율 (%) */
  expectedYieldCostPct: number;
  reason: string;
}

/** 사후 표준편차가 사전의 이 비율을 넘으면 아직 모른다고 본다 */
const UNCERTAIN_RATIO = 0.35;

/**
 * 무작위 흔들림이 잃어도 되는 예측 수율 상한(%). 정점 근처가 평평한 축에서는
 * 실제 손실이 이보다 훨씬 작고, 이 선을 넘는 축은 탐색이 아니라 이동 대상이다.
 */
const MAX_NUDGE_LOSS_PCT = 1.0;

export function activeLearningSuggest(
  obs: GrowthObservation[],
  cropKey?: string,
  opts?: {
    /** 배정 난수 시드. 실제 운영에서는 사이클 식별자를 넣는다 */
    seed?: number;
    /** 흔들림의 수율 손실을 계산할 표면. 없으면 손실 게이트 없이 배정한다 */
    fit?: GrowthRecipe;
  }
): {
  suggestions: ExperimentSuggestion[];
  assignment: ExperimentAssignment | null;
  /** 이미 쌓인 관측 중 무작위 배정 표식이 붙은 비율 */
  randomizedShare: number;
  note: string;
} {
  const target = cropKey ?? obs.find((o) => o.cropKey)?.cropKey ?? "leafy";
  const { setpoints } = agronomyInformedRecipe(obs, target);

  const suggestions: ExperimentSuggestion[] = [];
  const eligible: { i: number; ratio: number }[] = [];
  FEATURES.forEach((f, i) => {
    const sp = setpoints[i];
    const ratio = sp.sigPostZ / PRIOR_SD;
    if (ratio <= UNCERTAIN_RATIO) return;
    eligible.push({ i, ratio });
    suggestions.push({
      label: sp.label,
      suggestValue: Math.round(physical(sp.muZ + sp.sigPostZ, i, target) * 100) / 100,
      unit: sp.unit,
      uncertaintyRatio: Math.round(ratio * 100) / 100,
      reason:
        `사후 표준편차가 사전의 ${Math.round(ratio * 100)}%로 남아 있다 — ` +
        `이 요인을 흔들면 배우는 게 가장 많다.`,
    });
  });
  suggestions.sort((a, b) => b.uncertaintyRatio - a.uncertaintyRatio);

  // 한 사이클에서 무작위화되는 요인은 여섯 중 하나다. 나머지 다섯은 μ_post로
  // 결정론적으로 고정되고 계절과 교락된 채 남는다. 그래서 "배정 표식이 붙은 행의
  // 비율"을 인과 근거로 말하면 실제보다 여섯 배 넓게 읽힌다. 요인별로 센다.
  const randomizedByFeature = FEATURES.map(
    (f) => obs.filter((o) => o.assignment?.feature === f).length
  );
  const randomizedShare =
    obs.length === 0 ? 0 : Math.round((obs.filter((o) => o.assignment).length / obs.length) * 1000) / 1000;
  const causalFeatures = FEATURES.map((f, i) => ({ f, n: randomizedByFeature[i] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const assignment = drawAssignment(eligible, setpoints, target, opts);

  const gatePart =
    eligible.length > 0 && !assignment
      ? ` 다만 남은 요인은 모두 흔들었을 때 예측 손실이 ${MAX_NUDGE_LOSS_PCT}%를 넘어 배정하지 않는다 — 그 축은 탐색이 아니라 이동 대상이다.`
      : "";
  const causalPart =
    causalFeatures.length > 0
      ? ` 무작위 배정이 쌓인 요인은 ${causalFeatures
          .map((x) => `${FEATURE_LABEL[x.f]} ${x.n}회`)
          .join(" · ")}뿐이고, 인과로 읽을 수 있는 것도 그 요인들까지다 — 나머지는 관측이다.`
      : ` 쌓인 관측에 무작위 배정 표식이 하나도 없다 — 지금 설정점은 개입 권고가 아니라 가설이다.`;

  return {
    suggestions,
    assignment,
    randomizedShare,
    note:
      (eligible.length
        ? `${eligible.length}개 요인의 사후 표준편차가 사전의 ${Math.round(UNCERTAIN_RATIO * 100)}%를 넘는다 — 아직 데이터가 말해주지 않은 구간이다.${
            assignment
              ? ` 이번 사이클은 ${assignment.label}을(를) ${assignment.recipeValue}${assignment.unit} 대신 ${assignment.assignedValue}${assignment.unit}로 무작위 배정한다.`
              : ""
          }${gatePart}`
        : `모든 요인의 사후 표준편차가 사전의 ${Math.round(UNCERTAIN_RATIO * 100)}% 아래다 — 추가 실험 없이 현 레시피를 써도 된다.`) + causalPart,
  };
}

/** 요인 i의 정규화 좌표 값을 물리 단위로 */
function physical(z: number, i: number, cropKey: string): number {
  return fromNormalized(FEATURES.map((_, k) => (k === i ? z : 0)), cropKey)[FEATURES[i]];
}

// 요인 하나를 남은 불확실성에 비례해 뽑고, 방향을 동전으로 정한다.
// 방향을 관측이 성긴 쪽으로 고정하면 배정이 데이터에 의존하게 되어 계절과 다시
// 엮인다 — 무작위화의 값어치가 바로 거기서 사라진다.
function drawAssignment(
  eligible: { i: number; ratio: number }[],
  setpoints: HybridSetpoint[],
  target: string,
  opts?: { seed?: number; fit?: GrowthRecipe }
): ExperimentAssignment | null {
  if (eligible.length === 0) return null;

  // 시드가 사이클 번호라 1, 2, 3처럼 붙어 들어온다. 선형합동생성기는 그런 시드에
  // 대해 첫 난수가 거의 같아서 매 사이클 같은 요인이 뽑힌다 — 무작위가 아니게 된다.
  // 혼합 단계가 있는 생성기를 써야 이웃한 시드가 갈라진다.
  let s = (opts?.seed ?? 1) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const beta = opts?.fit?._beta;
  const baseZ = setpoints.map((sp) => sp.muZ);
  const baseY = beta ? predictSurface(beta, baseZ) : null;

  // 불확실성 비례 추첨. 손실 게이트에 걸리면 그 요인을 빼고 다시 뽑는다.
  const pool = [...eligible];
  while (pool.length) {
    const total = pool.reduce((a, e) => a + e.ratio, 0);
    let r = rand() * total;
    let pick = 0;
    while (pick < pool.length - 1 && r > pool[pick].ratio) {
      r -= pool[pick].ratio;
      pick++;
    }
    const { i } = pool[pick];
    const sp = setpoints[i];
    const dir = rand() < 0.5 ? -1 : 1;
    // 농학 정상범위 밖으로는 배정하지 않는다 — 배우자고 작물을 상하게 할 수 없다
    const z = Math.max(-1, Math.min(1, sp.muZ + dir * sp.sigPostZ));

    let costPct = 0;
    if (beta && baseY !== null && Math.abs(baseY) > 1e-6) {
      const nudged = [...baseZ];
      nudged[i] = z;
      costPct = ((baseY - predictSurface(beta, nudged)) / Math.abs(baseY)) * 100;
    }
    if (costPct <= MAX_NUDGE_LOSS_PCT) {
      return {
        feature: FEATURES[i],
        label: sp.label,
        unit: sp.unit,
        recipeValue: Math.round(physical(sp.muZ, i, target) * 100) / 100,
        assignedValue: Math.round(physical(z, i, target) * 100) / 100,
        z: Math.round(z * 1000) / 1000,
        direction: z >= sp.muZ ? "상향" : "하향",
        expectedYieldCostPct: Math.round(Math.max(0, costPct) * 100) / 100,
        reason:
          `사후 표준편차가 사전의 ${Math.round((sp.sigPostZ / PRIOR_SD) * 100)}%로 남은 요인이라 추첨 대상이었고, ` +
          `방향은 동전으로 정했다. 이 값은 계절·인력과 독립이라 다음 사이클의 수확이 ` +
          `이 요인의 인과 효과를 말해준다. 예측 수율 손실은 ${Math.round(Math.max(0, costPct) * 100) / 100}%다.`,
      };
    }
    pool.splice(pick, 1);
  }
  return null;
}

// ── 통합 오케스트레이터 ──────────────────────────────────────────────────────
// 관측은 growth-recipe-synth의 테스트 베드에서 온다. 그쪽이 오목성을 자체 검사하므로
// 여기서 나오는 최적점은 "알려진 정답을 되찾은 값"이다 — 실 수율 라벨은 1호점
// 수확 기록에서 확정한다.
export interface RecipeReport {
  samples: number;
  /** 표면 민감도 — 갭 분석과 같은 계수에서 나온다 */
  sensitivity: RecipeSensitivity[];
  hybrid: HybridSetpoint[];
  suggestions: ExperimentSuggestion[];
  /** 이번 사이클에 적용할 무작위 처리. null이면 흔들 축이 없다 */
  assignment: ExperimentAssignment | null;
  /** 쌓인 관측 중 무작위 배정 표식이 붙은 비율 — 0이면 인과 주장이 성립하지 않는다 */
  randomizedShare: number;
  hybridNote: string;
  suggestNote: string;
  /** 반응표면이 최대점을 갖는가 — 아니면 아래 갭 분석은 권고를 내지 않는다 */
  surface: SurfaceVerdict;
  modelR2: number | null;
  /** 열 스트레스로 무게가 절반 아래로 내려간 관측의 비율 */
  stressDownweightedShare: number;
  /** 주야 진폭이 커 사이클 평균이 대표성을 잃은 관측의 비율 */
  diurnalFlaggedShare: number;
  gap: RecipeGapReport;
  /** 같은 표면 위에서 수율이 아니라 수익을 최대화한 설정점 */
  profit: ProfitRecipe;
}

export function growthRecipeDemo(cropKey = "leafy", ledPowerKw = 4): RecipeReport {
  const { observations: obs } = generateObservations(LEAFY_SPEC, 120, 7, cropKey);
  const fit = analyzeGrowthRecipe(obs, { cropKey });
  const hybrid = agronomyInformedRecipe(obs, cropKey);
  // 시드는 실제 운영에서 사이클 식별자가 된다 — 데모에서는 관측 시드를 그대로 쓴다
  const active = activeLearningSuggest(obs, cropKey, { seed: 7, fit });
  // 현 사이트 조건 = 관측 평균. 갭 분석이 "여기서 저기로"를 말하는 출발점이다.
  const current = Object.fromEntries(
    FEATURES.map((f) => [f, obs.reduce((s, o) => s + o[f], 0) / obs.length])
  ) as Record<GrowthFeature, number>;
  return {
    samples: obs.length,
    sensitivity: fit.sensitivity,
    hybrid: hybrid.setpoints,
    suggestions: active.suggestions,
    assignment: active.assignment,
    randomizedShare: active.randomizedShare,
    hybridNote: hybrid.note,
    suggestNote: active.note,
    surface: fit.surface,
    modelR2: fit.modelR2,
    stressDownweightedShare: fit.stressDownweightedShare,
    diurnalFlaggedShare: fit.diurnalFlaggedShare,
    gap: recipeGapAnalysis(fit, current),
    profit: profitOptimalRecipe(obs, fit, { cropKey, ledPowerKw }),
  };
}
