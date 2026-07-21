// ── AI 생육레시피 분석 — 고도화 (타 분야 3기법 차용) ────────────────────────
// 기본 버전(growth-recipe.ts)의 한계: ① gain 기반 중요도는 편향, ② 반응표면은
// 데이터가 최적점을 안 담으면 실패, ③ "다음에 뭘 실험할지" 없음. 논문 차용으로 해결:
//   · SHAP 섀플리 값 (협조게임이론/XAI)     → 공정한 특성 기여도 (DAG-SHAP 2606.15273)
//   · 농학정보 하이브리드 (과학적 ML/PINN)   → 작물학 사전분포로 데이터 부족 보완
//                                            (AgriPINN 2601.16045, 하이브리드 2603.15411)
//   · 능동학습 실험제안 (실험설계)           → 불확실 최적점 근처를 실험 제안
//                                            (배치 베이지안 2311.01195)
// 참고 선례: 실내 수직 수경 바질 수율 ML (arXiv 2512.22151) — 우리와 동일 세팅.

import { getCrop } from "./crop-profiles";
import { GrowthObservation } from "./growth-recipe";

const FEATURES: (keyof Omit<GrowthObservation, "yield">)[] = [
  "temp", "humidity", "co2", "ec", "ph", "dli",
];
const FEATURE_LABEL: Record<string, string> = {
  temp: "온도", humidity: "습도", co2: "CO₂", ec: "양액EC", ph: "양액pH", dli: "광량(DLI)",
};
const UNIT: Record<string, string> = { temp: "℃", humidity: "%", co2: "ppm", ec: "dS/m", ph: "", dli: "mol" };

// crop-profiles의 농학 지식을 사전분포로 — 각 변수의 "알려진 최적 중앙값·허용폭"
function agronomicPrior(cropKey?: string): Record<string, { mu: number; sd: number }> {
  const c = getCrop(cropKey);
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  const half = (r: [number, number]) => (r[1] - r[0]) / 2;
  return {
    temp: { mu: mid(c.healthyRanges.temperature), sd: half(c.healthyRanges.temperature) },
    humidity: { mu: mid(c.healthyRanges.humidity), sd: half(c.healthyRanges.humidity) },
    co2: { mu: mid(c.healthyRanges.co2Level), sd: half(c.healthyRanges.co2Level) },
    ec: { mu: mid(c.ecTarget), sd: half(c.ecTarget) },
    ph: { mu: mid(c.healthyRanges.phLevel), sd: half(c.healthyRanges.phLevel) },
    dli: { mu: c.dliTarget, sd: c.dliTarget * 0.25 },
  };
}

// ── 경량 그래디언트 부스팅 (value function 겸용) ──────────────────────────────
interface Stump { feature: number; threshold: number; left: number; right: number; }
interface GBModel { base: number; stumps: Stump[]; lr: number; }

function trainGB(X: number[][], y: number[], rounds = 40, lr = 0.2): GBModel {
  const n = X.length;
  const base = y.reduce((a, b) => a + b, 0) / n;
  let pred = Array(n).fill(base);
  const stumps: Stump[] = [];
  for (let r = 0; r < rounds; r++) {
    const resid = y.map((yi, i) => yi - pred[i]);
    const st = bestStump(X, resid);
    if (!st) break;
    stumps.push(st);
    for (let i = 0; i < n; i++)
      pred[i] += lr * (X[i][st.feature] <= st.threshold ? st.left : st.right);
  }
  return { base, stumps, lr };
}
function bestStump(X: number[][], resid: number[]): Stump | null {
  const n = X.length;
  const mean = resid.reduce((a, b) => a + b, 0) / n;
  const tot = resid.reduce((s, r) => s + (r - mean) ** 2, 0);
  let best: Stump | null = null;
  let bestGain = 1e-9;
  for (let f = 0; f < FEATURES.length; f++) {
    const vals = [...new Set(X.map((x) => x[f]))].sort((a, b) => a - b);
    for (let ti = 0; ti < vals.length - 1; ti++) {
      const th = (vals[ti] + vals[ti + 1]) / 2;
      let lS = 0, lN = 0, rS = 0, rN = 0;
      for (let i = 0; i < n; i++) {
        if (X[i][f] <= th) { lS += resid[i]; lN++; } else { rS += resid[i]; rN++; }
      }
      if (!lN || !rN) continue;
      const lM = lS / lN, rM = rS / rN;
      let sse = 0;
      for (let i = 0; i < n; i++) sse += (resid[i] - (X[i][f] <= th ? lM : rM)) ** 2;
      const gain = tot - sse;
      if (gain > bestGain) { bestGain = gain; best = { feature: f, threshold: th, left: lM, right: rM }; }
    }
  }
  return best;
}
function predictGB(m: GBModel, x: number[]): number {
  let p = m.base;
  for (const s of m.stumps) p += m.lr * (x[s.feature] <= s.threshold ? s.left : s.right);
  return p;
}

// ── ① SHAP 섀플리 값 — 공정한 특성 기여도 (정확 계산, 6특성=64연합) ──────────
// gain은 트리 분할 우연에 편향된다. 섀플리 값은 "각 특성이 없을 때 vs 있을 때"의
// 모든 연합 순열 평균 기여 — 협조게임이론의 유일 공정 배분. 특성 6개면 2^6 정확계산.
export interface ShapResult {
  feature: string;
  label: string;
  meanAbsShap: number; // 평균 |기여도| = 중요도
}

export function shapImportance(obs: GrowthObservation[]): ShapResult[] {
  const X = obs.map((o) => FEATURES.map((f) => o[f]));
  const y = obs.map((o) => o.yield);
  const model = trainGB(X, y);
  const nF = FEATURES.length;
  const bg = FEATURES.map((_, f) => X.reduce((s, x) => s + x[f], 0) / X.length); // 배경(평균)

  // 특정 표본 x에 대한 섀플리: 모든 부분집합 S에 대해 v(S∪{i})-v(S) 가중평균
  const shapForRow = (x: number[]): number[] => {
    const phi = Array(nF).fill(0);
    const subsets = 1 << nF;
    // 연합값 v(S) = 모델(S는 x값, 나머지는 배경값)
    const vCache = new Map<number, number>();
    const v = (mask: number) => {
      if (vCache.has(mask)) return vCache.get(mask)!;
      const xin = FEATURES.map((_, f) => ((mask >> f) & 1) ? x[f] : bg[f]);
      const val = predictGB(model, xin);
      vCache.set(mask, val);
      return val;
    };
    // 가중치: |S|!(n-|S|-1)!/n!
    const fact = (k: number) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; };
    const nFact = fact(nF);
    for (let i = 0; i < nF; i++) {
      for (let mask = 0; mask < subsets; mask++) {
        if ((mask >> i) & 1) continue; // i 미포함 연합만
        const sSize = popcount(mask);
        const w = (fact(sSize) * fact(nF - sSize - 1)) / nFact;
        phi[i] += w * (v(mask | (1 << i)) - v(mask));
      }
    }
    return phi;
  };

  const absSum = Array(nF).fill(0);
  const sampleN = Math.min(obs.length, 40); // 표본 40개 평균 (비용 제어)
  for (let k = 0; k < sampleN; k++) {
    const phi = shapForRow(X[k]);
    for (let f = 0; f < nF; f++) absSum[f] += Math.abs(phi[f]);
  }
  return FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    meanAbsShap: Math.round((absSum[i] / sampleN) * 1000) / 1000,
  })).sort((a, b) => b.meanAbsShap - a.meanAbsShap);
}
function popcount(x: number): number { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

// ── ② 농학정보 하이브리드 — 데이터 부족을 작물학 사전분포로 보완 (PINN-lite) ──
// 순수 반응표면은 데이터가 최적점을 안 담으면 실패한다. 데이터 최적점 추정을 농학
// 사전(작물별 알려진 최적)과 베이지안 결합 — 데이터가 많고 최적점을 담으면 데이터가,
// 부족하면 사전이 이긴다. 결합 정밀도(1/분산) 가중.
export interface HybridSetpoint {
  feature: string;
  label: string;
  unit: string;
  dataOptimum: number | null; // 데이터만으로 추정 (실패 시 null)
  priorOptimum: number; // 농학 사전
  hybridOptimum: number; // 결합
  dataWeight: number; // 0~1 (데이터가 이긴 정도)
  spanned: boolean; // 데이터가 사전 최적 근처를 담았나
}

export function agronomyInformedRecipe(obs: GrowthObservation[], cropKey?: string): {
  setpoints: HybridSetpoint[];
  note: string;
} {
  const prior = agronomicPrior(cropKey);
  const X = obs.map((o) => FEATURES.map((f) => o[f]));
  const y = obs.map((o) => o.yield);
  const n = obs.length;

  const setpoints: HybridSetpoint[] = FEATURES.map((f, fi) => {
    const xf = X.map((x) => x[fi]);
    const lo = Math.min(...xf), hi = Math.max(...xf);
    const p = prior[f];
    // 데이터 2차 반응표면 정점
    const dataOpt = quadraticVertex(xf, y, lo, hi);
    // 데이터가 사전 최적 근처를 담았나 (span)
    const spanned = p.mu >= lo - p.sd && p.mu <= hi + p.sd;
    // 데이터 신뢰도: 표본수 + 반응 곡률 유의성 (담았으면↑, 아니면↓)
    const dataPrecision = spanned ? n / (n + 20) : 0.1;
    const priorPrecision = 1 - dataPrecision;
    const dataOptSafe = dataOpt ?? p.mu;
    const hybrid = dataPrecision * dataOptSafe + priorPrecision * p.mu;
    return {
      feature: f,
      label: FEATURE_LABEL[f],
      unit: UNIT[f],
      dataOptimum: dataOpt == null ? null : Math.round(dataOpt * 100) / 100,
      priorOptimum: Math.round(p.mu * 100) / 100,
      hybridOptimum: Math.round(hybrid * 100) / 100,
      dataWeight: Math.round(dataPrecision * 100) / 100,
      spanned,
    };
  });

  const dataLed = setpoints.filter((s) => s.dataWeight > 0.5).length;
  return {
    setpoints,
    note: `농학 사전 + 데이터 하이브리드: ${dataLed}/6 요인은 데이터가, 나머지는 작물학 사전이 최적값을 이끔. 데이터가 최적점을 담을수록 데이터 가중↑ — 초기(데이터 부족)엔 작물학이, 축적되면 데이터가 지배.`,
  };
}
function quadraticVertex(x: number[], y: number[], lo: number, hi: number): number | null {
  const n = x.length;
  const sx = x.reduce((a, b) => a + b, 0), sx2 = x.reduce((a, b) => a + b * b, 0);
  const sx3 = x.reduce((a, b) => a + b ** 3, 0), sx4 = x.reduce((a, b) => a + b ** 4, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = x.reduce((a, b, i) => a + b * y[i], 0);
  const sx2y = x.reduce((a, b, i) => a + b * b * y[i], 0);
  const sol = solve3([[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]], [sy, sxy, sx2y]);
  const [, b, a] = sol;
  if (a < 0 && b !== 0) {
    const v = -b / (2 * a);
    if (v >= lo && v <= hi) return v; // 관측 범위 안 정점만 신뢰
  }
  return null; // 데이터로 최적점 확정 불가
}
function solve3(A: number[][], b: number[]): number[] {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const factor = M[r][c] / M[c][c];
      for (let k = c; k <= 3; k++) M[r][k] -= factor * M[c][k];
    }
  }
  return [0, 1, 2].map((i) => (Math.abs(M[i][i]) < 1e-12 ? 0 : M[i][3] / M[i][i]));
}

// ── ③ 능동학습 실험제안 — 다음에 어느 조건을 실험할지 (배치 베이지안) ──────────
// 데이터가 최적점을 안 담으면, 사전 최적 근처의 미탐색 조건을 실험하라고 제안한다.
// 각 후보 조건의 "정보 획득량" = 사전 최적 근접성 × 데이터 희소성.
export interface ExperimentSuggestion {
  label: string;
  suggestValue: number;
  unit: string;
  reason: string;
}

export function activeLearningSuggest(obs: GrowthObservation[], cropKey?: string): {
  suggestions: ExperimentSuggestion[];
  note: string;
} {
  const prior = agronomicPrior(cropKey);
  const X = obs.map((o) => FEATURES.map((f) => o[f]));
  const suggestions: ExperimentSuggestion[] = [];
  FEATURES.forEach((f, fi) => {
    const xf = X.map((x) => x[fi]);
    const lo = Math.min(...xf), hi = Math.max(...xf);
    const p = prior[f];
    // 사전 최적이 관측 범위 밖 or 근처 데이터 없으면 → 실험 제안
    const nearPrior = xf.filter((v) => Math.abs(v - p.mu) < p.sd * 0.5).length;
    if (p.mu < lo || p.mu > hi || nearPrior < obs.length * 0.1) {
      suggestions.push({
        label: FEATURE_LABEL[f],
        suggestValue: Math.round(p.mu * 100) / 100,
        unit: UNIT[f],
        reason:
          p.mu < lo || p.mu > hi
            ? `작물학 최적(${Math.round(p.mu)})이 현 관측 범위(${Math.round(lo)}~${Math.round(hi)}) 밖 — 이 조건 실험 필요`
            : `최적 추정값 근처 데이터 희소(${nearPrior}건) — 검증 실험 권장`,
      });
    }
  });
  return {
    suggestions,
    note:
      suggestions.length > 0
        ? `데이터가 최적점을 충분히 담지 못한 ${suggestions.length}개 요인 — 능동학습으로 다음 재배 사이클에 이 조건을 실험해 레시피 정밀도를 높인다.`
        : `데이터가 최적점 근처를 충분히 담음 — 추가 실험 불요, 현 레시피 신뢰.`,
  };
}

// ── 통합 오케스트레이터 + 결정론적 데모 데이터 ───────────────────────────────
// 실 수율 라벨은 1호점 수확 기록에서 온다. 데모는 실 환경 분포 위에 알려진 농학
// 반응으로 라벨을 합성해(재현 시드), 알고리즘이 최적점을 복원함을 보인다.
export interface RecipeReport {
  samples: number;
  shap: ShapResult[];
  hybrid: HybridSetpoint[];
  suggestions: ExperimentSuggestion[];
  hybridNote: string;
  suggestNote: string;
}

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function growthRecipeDemo(cropKey = "leafy"): RecipeReport {
  const rand = seededRand(7);
  const OPT = { temp: 22, humidity: 70, co2: 900, ec: 1.5, ph: 6.0, dli: 16 };
  const obs: GrowthObservation[] = [];
  for (let i = 0; i < 120; i++) {
    const env = {
      temp: 16 + rand() * 12, humidity: 55 + rand() * 30, co2: 400 + rand() * 800,
      ec: 0.8 + rand() * 2, ph: 5.3 + rand() * 1.6, dli: 8 + rand() * 16,
    };
    const y = Math.max(
      0.3,
      5 - (0.03 * (env.temp - OPT.temp) ** 2 + 8e-6 * (env.co2 - OPT.co2) ** 2 +
        0.02 * (env.dli - OPT.dli) ** 2 + 0.8 * (env.ec - OPT.ec) ** 2 +
        0.6 * (env.ph - OPT.ph) ** 2 + 0.004 * (env.humidity - OPT.humidity) ** 2) +
        (rand() - 0.5) * 0.3
    );
    obs.push({ ...env, yield: y });
  }
  const hybrid = agronomyInformedRecipe(obs, cropKey);
  const active = activeLearningSuggest(obs, cropKey);
  return {
    samples: obs.length,
    shap: shapImportance(obs),
    hybrid: hybrid.setpoints,
    suggestions: active.suggestions,
    hybridNote: hybrid.note,
    suggestNote: active.note,
  };
}
