// ── AI 생육레시피 분석 — 고도화 ─────────────────────────────────────────────
// 기본 버전(growth-recipe.ts)이 하나의 표면에서 최적점 하나를 낸다면, 여기서는
// 그 최적점이 얼마나 믿을 만한지와, 그 믿음을 어디서 빌려왔는지를 다룬다.
//   · SHAP 섀플리 값 (협조게임이론/XAI)  → 편향 없는 특성 기여도
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
  zBounds,
  recipeGapAnalysis,
  FEATURES,
  FEATURE_LABEL,
  UNIT,
  type GrowthFeature,
  type SurfaceVerdict,
  type RecipeGapReport,
} from "./growth-recipe";
import { toNormalized, fromNormalized, transferWeight } from "./crop-normalize";
import { LEAFY_SPEC, generateObservations } from "./growth-recipe-synth";

// 정규화 좌표에서 농학 사전은 언제나 N(0, PRIOR_SD²)이다 — z=0이 문헌 최적,
// z=±1이 정상범위 경계라는 정의에서 바로 나온다. 폭을 0.5로 두는 건 "정상범위"를
// ±2σ(약 95%)로 읽는다는 뜻이다. ±1σ로 읽으면 문헌이 말한 범위 밖에 확률질량이
// 3분의 1이나 남아, 농학 지식을 실제보다 약하게 쓰게 된다.
const PRIOR_SD = 0.5;

// ── 깊이2 결정트리 (2단 분할 — 상호작용 포착) ────────────────────────────────
// 깊이1 스텀프는 순수 가법모델 → SHAP이 주효과만 본다.
// 깊이2는 "루트 분할 후 각 자식에서 추가 분할" → 변수 간 조건부 상호작용 반영.
interface Tree2 {
  rootF: number; rootT: number;
  leftF: number; leftT: number; ll: number; lr: number; leftIsLeaf: boolean;
  rightF: number; rightT: number; rl: number; rr: number; rightIsLeaf: boolean;
}
interface GBModel { base: number; trees: Tree2[]; lr: number; }

// 인덱스 부분집합에서 최적 분할 탐색 (깊이2 트리 자식 노드 구성용)
// 잎에 남는 최소 표본 — 1개짜리 잎을 허용하면 40라운드가 잡음을 그대로 외운다.
const MIN_LEAF = 5;

function bestSplitOnIdx(
  X: number[][], resid: number[], indices: number[]
): { f: number; t: number; lM: number; rM: number } | null {
  const n = indices.length;
  if (n < 2 * MIN_LEAF) return null;
  const rMean = indices.reduce((s, i) => s + resid[i], 0) / n;
  const tot = indices.reduce((s, i) => s + (resid[i] - rMean) ** 2, 0);
  let best: { f: number; t: number; lM: number; rM: number; gain: number } | null = null;
  let bestGain = 1e-9;
  for (let f = 0; f < FEATURES.length; f++) {
    const vals = [...new Set(indices.map((i) => X[i][f]))].sort((a, b) => a - b);
    for (let ti = 0; ti < vals.length - 1; ti++) {
      const t = (vals[ti] + vals[ti + 1]) / 2;
      let lS = 0, lN = 0, rS = 0, rN = 0;
      for (const i of indices) {
        if (X[i][f] <= t) { lS += resid[i]; lN++; } else { rS += resid[i]; rN++; }
      }
      if (lN < MIN_LEAF || rN < MIN_LEAF) continue;
      const lM = lS / lN, rM = rS / rN;
      let sse = 0;
      for (const i of indices) sse += (resid[i] - (X[i][f] <= t ? lM : rM)) ** 2;
      const gain = tot - sse;
      if (gain > bestGain) { bestGain = gain; best = { f, t, lM, rM, gain }; }
    }
  }
  return best ? { f: best.f, t: best.t, lM: best.lM, rM: best.rM } : null;
}

function bestTree2(X: number[][], resid: number[]): Tree2 | null {
  const n = X.length;
  const all = Array.from({ length: n }, (_, i) => i);
  const root = bestSplitOnIdx(X, resid, all);
  if (!root) return null;

  const leftIdx = all.filter((i) => X[i][root.f] <= root.t);
  const rightIdx = all.filter((i) => X[i][root.f] > root.t);
  const leftMean = leftIdx.reduce((s, i) => s + resid[i], 0) / leftIdx.length;
  const rightMean = rightIdx.reduce((s, i) => s + resid[i], 0) / rightIdx.length;

  const leftChild = bestSplitOnIdx(X, resid, leftIdx);
  const rightChild = bestSplitOnIdx(X, resid, rightIdx);

  return {
    rootF: root.f, rootT: root.t,
    leftF: leftChild?.f ?? 0, leftT: leftChild?.t ?? 0,
    ll: leftChild?.lM ?? leftMean, lr: leftChild?.rM ?? leftMean,
    leftIsLeaf: !leftChild,
    rightF: rightChild?.f ?? 0, rightT: rightChild?.t ?? 0,
    rl: rightChild?.lM ?? rightMean, rr: rightChild?.rM ?? rightMean,
    rightIsLeaf: !rightChild,
  };
}

function predictTree2(tree: Tree2, x: number[]): number {
  if (x[tree.rootF] <= tree.rootT) {
    if (tree.leftIsLeaf) return tree.ll;
    return x[tree.leftF] <= tree.leftT ? tree.ll : tree.lr;
  } else {
    if (tree.rightIsLeaf) return tree.rl;
    return x[tree.rightF] <= tree.rightT ? tree.rl : tree.rr;
  }
}

function trainGB(X: number[][], y: number[], rounds = 40, lr = 0.2): GBModel {
  const n = X.length;
  const base = y.reduce((a, b) => a + b, 0) / n;
  let pred = Array(n).fill(base);
  const trees: Tree2[] = [];
  for (let r = 0; r < rounds; r++) {
    const resid = y.map((yi, i) => yi - pred[i]);
    const tree = bestTree2(X, resid);
    if (!tree) break;
    trees.push(tree);
    for (let i = 0; i < n; i++)
      pred[i] += lr * predictTree2(tree, X[i]);
  }
  return { base, trees, lr };
}

function predictGB(m: GBModel, x: number[]): number {
  let p = m.base;
  for (const t of m.trees) p += m.lr * predictTree2(t, x);
  return p;
}

// ── ① SHAP 섀플리 값 — 공정한 특성 기여도 (정확 계산, 6특성=64연합) ──────────
// gain은 트리 분할 우연에 편향된다. 섀플리 값은 "각 특성이 없을 때 vs 있을 때"의
// 모든 연합 순열 평균 기여 — 협조게임이론의 유일 공정 배분. 특성 6개면 2^6 정확계산.
// 깊이2 GB 위에서 실행 → 상호작용 효과가 SHAP에 배분된다.
export interface ShapResult {
  feature: string;
  label: string;
  meanAbsShap: number;
}

export function shapImportance(obs: GrowthObservation[], cropKey?: string): ShapResult[] {
  const X = obs.map((o) => toNormalized(o, o.cropKey ?? cropKey));
  const y = obs.map((o) => o.yield);
  const model = trainGB(X, y);
  const nF = FEATURES.length;

  // 기준선은 f(평균벡터)가 아니라 E[f(x)]다. 비선형 모델에서 둘은 다르고, 평균벡터를
  // 쓰면 Σφ = f(x) − E[f]라는 섀플리의 효율성 공리가 깨진다. 배경 표본에 대해
  // 평균을 내는 개입(interventional) 방식으로 계산한다.
  const bgStride = Math.max(1, Math.floor(X.length / 20));
  const background = X.filter((_, i) => i % bgStride === 0).slice(0, 20);

  const shapForRow = (x: number[]): number[] => {
    const phi = Array(nF).fill(0);
    const subsets = 1 << nF;
    const vCache = new Map<number, number>();
    const v = (mask: number) => {
      if (vCache.has(mask)) return vCache.get(mask)!;
      let acc = 0;
      for (const bgRow of background) {
        acc += predictGB(
          model,
          FEATURES.map((_, f) => (((mask >> f) & 1) ? x[f] : bgRow[f]))
        );
      }
      const val = acc / background.length;
      vCache.set(mask, val);
      return val;
    };
    const fact = (k: number) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; };
    const nFact = fact(nF);
    for (let i = 0; i < nF; i++) {
      for (let mask = 0; mask < subsets; mask++) {
        if ((mask >> i) & 1) continue;
        const sSize = popcount(mask);
        const w = (fact(sSize) * fact(nF - sSize - 1)) / nFact;
        phi[i] += w * (v(mask | (1 << i)) - v(mask));
      }
    }
    return phi;
  };

  // 앞에서부터 40행이 아니라 전 구간에서 고르게 뽑는다 — 관측이 시간순이면
  // 앞머리 40개는 한 계절만 보는 것과 같다.
  const absSum = Array(nF).fill(0);
  const stride = Math.max(1, Math.floor(X.length / 40));
  const rows = X.filter((_, i) => i % stride === 0).slice(0, 40);
  for (const row of rows) {
    const phi = shapForRow(row);
    for (let f = 0; f < nF; f++) absSum[f] += Math.abs(phi[f]);
  }
  const sampleN = rows.length;
  return FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    meanAbsShap: Math.round((absSum[i] / sampleN) * 1000) / 1000,
  })).sort((a, b) => b.meanAbsShap - a.meanAbsShap);
}
function popcount(x: number): number { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

// ── ② 부트스트랩으로 최적점의 실제 불확실성을 잰다 ──────────────────────────
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
  clamp: boolean,
  replicates = 200,
  seed = 11
): BootstrapOptimum {
  const n = Z.length;
  const nF = FEATURES.length;
  // 탐색범위는 원표본으로 고정한다. 재표본마다 상자를 다시 잡으면 산포에
  // "상자가 흔들린 몫"이 섞여 최적점 자체의 불확실성이 아니게 된다.
  const bounds = zBounds(Z, clamp);

  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const draws: number[][] = [];
  for (let b = 0; b < replicates; b++) {
    const zi: number[][] = [];
    const yi: number[] = [];
    for (let k = 0; k < n; k++) {
      const j = Math.min(n - 1, Math.floor(rand() * n));
      zi.push(Z[j]);
      yi.push(y[j]);
    }
    const beta = fitResponseSurface(zi, yi);
    const opt = optimumZ(beta, bounds);
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

// ── ③ 계층 사전 — 문헌 → 다른 품종 → 이 품종 ────────────────────────────────
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
    fits.set(k, bootstrapOptimum(Z, rows.map((o) => o.yield), true));
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

// ── ④ 능동학습 실험제안 — 사후분산이 큰 요인부터 ────────────────────────────
// 사후 표준편차가 실제 데이터에서 나오므로, 제안 여부가 표본 수 임계값이 아니라
// "아직 모르는 정도"에 걸린다. 방향은 관측이 성긴 쪽으로 잡는다 — 이미 촘촘한
// 구간을 한 번 더 재봐야 배우는 게 없다.
export interface ExperimentSuggestion {
  label: string;
  suggestValue: number;
  unit: string;
  /** 이 실험으로 줄어들 것으로 보는 사후 표준편차 비율 */
  uncertaintyRatio: number;
  reason: string;
}

/** 사후 표준편차가 사전의 이 비율을 넘으면 아직 모른다고 본다 */
const UNCERTAIN_RATIO = 0.35;

export function activeLearningSuggest(
  obs: GrowthObservation[],
  cropKey?: string
): { suggestions: ExperimentSuggestion[]; note: string } {
  const target = cropKey ?? obs.find((o) => o.cropKey)?.cropKey ?? "leafy";
  const { setpoints } = agronomyInformedRecipe(obs, target);
  const Z = obs.map((o) => toNormalized(o, o.cropKey ?? target));

  const suggestions: ExperimentSuggestion[] = [];
  FEATURES.forEach((f, i) => {
    const sp = setpoints[i];
    const ratio = sp.sigPostZ / PRIOR_SD;
    if (ratio <= UNCERTAIN_RATIO) return;

    // 관측이 성긴 쪽으로 1σ 나간 점. 이미 촘촘한 구간을 한 번 더 재봐야 배울 게 없다.
    const zf = Z.map((z) => z[i]);
    const zMean = zf.reduce((a, b) => a + b, 0) / zf.length;
    const side = sp.muZ >= zMean ? 1 : -1;
    const probeZ = sp.muZ + side * sp.sigPostZ;
    const probe = fromNormalized(
      FEATURES.map((_, k) => (k === i ? probeZ : 0)),
      target
    )[f];

    suggestions.push({
      label: sp.label,
      suggestValue: Math.round(probe * 100) / 100,
      unit: sp.unit,
      uncertaintyRatio: Math.round(ratio * 100) / 100,
      reason:
        `사후 표준편차가 사전의 ${Math.round(ratio * 100)}%로 남아 있다. ` +
        `관측이 성긴 ${side > 0 ? "높은" : "낮은"} 쪽 ${Math.round(probe * 100) / 100}${sp.unit}에서 한 사이클 시험하면 ` +
        `이 요인의 추정이 가장 많이 좁아진다.`,
    });
  });

  suggestions.sort((a, b) => b.uncertaintyRatio - a.uncertaintyRatio);
  return {
    suggestions,
    note: suggestions.length
      ? `${suggestions.length}개 요인의 사후 표준편차가 사전의 ${Math.round(UNCERTAIN_RATIO * 100)}%를 넘는다 — 아직 데이터가 말해주지 않은 구간이다. 제안 조건으로 한 사이클 돌린 뒤 재학습하면 그만큼 좁아진다.`
      : `모든 요인의 사후 표준편차가 사전의 ${Math.round(UNCERTAIN_RATIO * 100)}% 아래다 — 추가 실험 없이 현 레시피를 써도 된다.`,
  };
}

// ── 통합 오케스트레이터 ──────────────────────────────────────────────────────
// 관측은 growth-recipe-synth의 테스트 베드에서 온다. 그쪽이 오목성을 자체 검사하므로
// 여기서 나오는 최적점은 "알려진 정답을 되찾은 값"이다 — 실 수율 라벨은 1호점
// 수확 기록에서 확정한다.
export interface RecipeReport {
  samples: number;
  shap: ShapResult[];
  hybrid: HybridSetpoint[];
  suggestions: ExperimentSuggestion[];
  hybridNote: string;
  suggestNote: string;
  /** 반응표면이 최대점을 갖는가 — 아니면 아래 갭 분석은 권고를 내지 않는다 */
  surface: SurfaceVerdict;
  modelR2: number | null;
  gap: RecipeGapReport;
}

export function growthRecipeDemo(cropKey = "leafy"): RecipeReport {
  const { observations: obs } = generateObservations(LEAFY_SPEC, 120, 7, cropKey);
  const fit = analyzeGrowthRecipe(obs, { cropKey });
  const hybrid = agronomyInformedRecipe(obs, cropKey);
  const active = activeLearningSuggest(obs, cropKey);
  // 현 사이트 조건 = 관측 평균. 갭 분석이 "여기서 저기로"를 말하는 출발점이다.
  const current = Object.fromEntries(
    FEATURES.map((f) => [f, obs.reduce((s, o) => s + o[f], 0) / obs.length])
  ) as Record<GrowthFeature, number>;
  return {
    samples: obs.length,
    shap: shapImportance(obs, cropKey),
    hybrid: hybrid.setpoints,
    suggestions: active.suggestions,
    hybridNote: hybrid.note,
    suggestNote: active.note,
    surface: fit.surface,
    modelR2: fit.modelR2,
    gap: recipeGapAnalysis(fit, current),
  };
}
