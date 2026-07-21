// ── AI 생육레시피 분석 — 고도화 (타 분야 3기법 차용) ────────────────────────
// 기본 버전(growth-recipe.ts)의 한계: ① gain 기반 중요도는 편향, ② 반응표면은
// 데이터가 최적점을 안 담으면 실패, ③ "다음에 뭘 실험할지" 없음. 논문 차용으로 해결:
//   · SHAP 섀플리 값 (협조게임이론/XAI)        → 공정한 특성 기여도 (DAG-SHAP 2606.15273)
//   · 농학사전 정규화 하이브리드 (정규-정규 켤레) → 작물학 사전분포로 데이터 부족 보완
//     [신경망·미분방정식 없음. "AgriPINN"이 아닌 베이지안 켤레 업데이트]
//   · UCB 획득함수 능동학습 (실험설계)          → 사후분산 최대점을 다음 실험으로 제안
//     (배치 베이지안 2311.01195)
// 참고 선례: 실내 수직 수경 바질 수율 ML (arXiv 2512.22151) — 우리와 동일 세팅.
// GB는 깊이2 트리(2단 분할)로 상호작용 포착 — SHAP이 주효과 이상을 반영.

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
function bestSplitOnIdx(
  X: number[][], resid: number[], indices: number[]
): { f: number; t: number; lM: number; rM: number } | null {
  const n = indices.length;
  if (n < 2) return null;
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
      if (!lN || !rN) continue;
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

  const leftChild = leftIdx.length >= 2 ? bestSplitOnIdx(X, resid, leftIdx) : null;
  const rightChild = rightIdx.length >= 2 ? bestSplitOnIdx(X, resid, rightIdx) : null;

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

export function shapImportance(obs: GrowthObservation[]): ShapResult[] {
  const X = obs.map((o) => FEATURES.map((f) => o[f]));
  const y = obs.map((o) => o.yield);
  const model = trainGB(X, y);
  const nF = FEATURES.length;
  const bg = FEATURES.map((_, f) => X.reduce((s, x) => s + x[f], 0) / X.length);

  const shapForRow = (x: number[]): number[] => {
    const phi = Array(nF).fill(0);
    const subsets = 1 << nF;
    const vCache = new Map<number, number>();
    const v = (mask: number) => {
      if (vCache.has(mask)) return vCache.get(mask)!;
      const xin = FEATURES.map((_, f) => ((mask >> f) & 1) ? x[f] : bg[f]);
      const val = predictGB(model, xin);
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

  const absSum = Array(nF).fill(0);
  const sampleN = Math.min(obs.length, 40);
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

// ── 1D 2차 적합 + 정점 SE (델타법) ──────────────────────────────────────────
// 정점 v = -b/(2a)의 분산: 델타법으로 Var(v) ≈ g^T Cov(a,b) g 계산.
// Cov(a,b) = sigma_y² * (X'X)^{-1}[1:3,1:3] — 3×3 역행렬 필요.
function inv3(A: number[][]): number[][] | null {
  const M = A.map((row, i) => {
    const id = [0, 0, 0]; id[i] = 1;
    return [...row, ...id];
  });
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    const d = M[c][c];
    for (let k = c; k < 6; k++) M[c][k] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let k = c; k < 6; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [
    [M[0][3], M[0][4], M[0][5]],
    [M[1][3], M[1][4], M[1][5]],
    [M[2][3], M[2][4], M[2][5]],
  ];
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

// 1D 2차 회귀: 정점 추정값 + 표준오차 (델타법)
function quadraticVertexWithSE(
  x: number[], y: number[], lo: number, hi: number
): { vertex: number | null; se: number } {
  const n = x.length;
  if (n < 4) return { vertex: null, se: Infinity };
  const sx = x.reduce((a, b) => a + b, 0);
  const sx2 = x.reduce((a, b) => a + b * b, 0);
  const sx3 = x.reduce((a, b) => a + b ** 3, 0);
  const sx4 = x.reduce((a, b) => a + b ** 4, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = x.reduce((a, b, i) => a + b * y[i], 0);
  const sx2y = x.reduce((a, b, i) => a + b * b * y[i], 0);
  const A = [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]];
  const [c, b, a] = solve3(A, [sy, sxy, sx2y]);

  let vertex: number | null = null;
  if (a < -1e-12 && Math.abs(b) > 1e-12) {
    const v = -b / (2 * a);
    if (v >= lo && v <= hi) vertex = v;
  }

  // 잔차 표준편차 sigma_y
  const yPred = x.map((xi) => a * xi * xi + b * xi + c);
  const rss = y.reduce((s, yi, i) => s + (yi - yPred[i]) ** 2, 0);
  const sigma2 = rss / Math.max(n - 3, 1);

  let se = Infinity;
  if (vertex !== null && Math.abs(a) > 1e-12) {
    const Ainv = inv3(A);
    if (Ainv) {
      // Var(v=-b/2a): 델타법 편미분
      // dv/da = b/(2a²), dv/db = -1/(2a)
      const da = b / (2 * a * a);
      const db = -1 / (2 * a);
      const varV = sigma2 * (
        da * da * Ainv[2][2] +
        db * db * Ainv[1][1] +
        2 * da * db * Ainv[2][1]
      );
      se = Math.sqrt(Math.max(0, varV));
    }
  }
  return { vertex, se };
}

// ── ② 농학정보 하이브리드 — 정규-정규 켤레 베이지안 업데이트 ────────────────
// 사전 θ* ~ N(mu0, sig0²) (crop-profiles 농학 최적),
// 데이터 우도: 2차 정점 추정값 θ̂, 표준오차 SE (델타법)
// 정밀도 합산: τ_post = τ_prior + τ_lik (τ = 1/σ²)
// 사후 평균: μ_post = (τ_prior*μ0 + τ_lik*θ̂) / τ_post
// 이진절벽 없는 매끄러운 전이 + 사후분산 확인 가능.
// 라벨 정직화: 신경망·미분방정식 없음 — "농학사전 정규화 하이브리드"
export interface HybridSetpoint {
  feature: string;
  label: string;
  unit: string;
  dataOptimum: number | null;
  priorOptimum: number;
  hybridOptimum: number;
  dataWeight: number; // 0~1 (τ_lik / τ_post)
  spanned: boolean;   // 데이터가 사전 최적 근처를 담았나 (참고용)
  sigPost: number;    // 사후 표준편차 (능동학습 획득함수용)
}

export function agronomyInformedRecipe(obs: GrowthObservation[], cropKey?: string): {
  setpoints: HybridSetpoint[];
  note: string;
} {
  const prior = agronomicPrior(cropKey);
  const X = obs.map((o) => FEATURES.map((f) => o[f]));
  const y = obs.map((o) => o.yield);

  const setpoints: HybridSetpoint[] = FEATURES.map((f, fi) => {
    const xf = X.map((x) => x[fi]);
    const lo = Math.min(...xf), hi = Math.max(...xf);
    const p = prior[f];

    const { vertex: dataOpt, se: seTheta } = quadraticVertexWithSE(xf, y, lo, hi);

    // 정규-정규 켤레 업데이트
    const tau0 = 1 / (p.sd * p.sd);                              // 사전 정밀도
    const tauLik = (seTheta < 1e6 && dataOpt !== null)
      ? 1 / (seTheta * seTheta) : 0;                             // 데이터 정밀도
    const tauPost = tau0 + tauLik;
    const muPost = (tau0 * p.mu + tauLik * (dataOpt ?? p.mu)) / tauPost;
    const sigPost = 1 / Math.sqrt(tauPost);
    const dataWeight = tauLik / tauPost;

    const spanned = p.mu >= lo - p.sd && p.mu <= hi + p.sd;

    return {
      feature: f,
      label: FEATURE_LABEL[f],
      unit: UNIT[f],
      dataOptimum: dataOpt == null ? null : Math.round(dataOpt * 100) / 100,
      priorOptimum: Math.round(p.mu * 100) / 100,
      hybridOptimum: Math.round(muPost * 100) / 100,
      dataWeight: Math.round(dataWeight * 100) / 100,
      spanned,
      sigPost: Math.round(sigPost * 1000) / 1000,
    };
  });

  const dataLed = setpoints.filter((s) => s.dataWeight > 0.5).length;
  return {
    setpoints,
    note: `농학사전 정규화 하이브리드 (신경망·미분방정식 없음): ${dataLed}/6 요인은 데이터가, 나머지는 작물학 사전이 최적값을 이끔. 정규-정규 켤레 베이지안으로 이진절벽 없는 매끄러운 전이 — 초기(데이터 부족)엔 사전이, 축적되면 데이터가 지배.`,
  };
}

// ── ③ 능동학습 실험제안 — 사후분산 UCB 획득함수 ────────────────────────────
// 단순 임계 규칙 대신, 사후 표준편차(sigPost)를 기반으로 UCB 탐색점을 제안한다.
// UCB = μ_post + κ*σ_post (κ=1). 불확실성이 사전의 50% 이상 남은 요인만 제안.
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
  const y = obs.map((o) => o.yield);
  const suggestions: ExperimentSuggestion[] = [];
  const kappa = 1.0; // UCB 탐색-활용 트레이드오프

  FEATURES.forEach((f, fi) => {
    const xf = X.map((x) => x[fi]);
    const lo = Math.min(...xf), hi = Math.max(...xf);
    const p = prior[f];

    const { vertex: dataOpt, se: seTheta } = quadraticVertexWithSE(xf, y, lo, hi);

    // 사후 베이지안 업데이트
    const tau0 = 1 / (p.sd * p.sd);
    const tauLik = (seTheta < 1e6 && dataOpt !== null) ? 1 / (seTheta * seTheta) : 0;
    const tauPost = tau0 + tauLik;
    const muPost = (tau0 * p.mu + tauLik * (dataOpt ?? p.mu)) / tauPost;
    const sigPost = 1 / Math.sqrt(tauPost);

    // 불확실성이 사전의 50% 이상 남아있으면 실험 제안
    const uncertaintyRatio = sigPost / p.sd;
    if (uncertaintyRatio > 0.5) {
      // UCB 탐색점: 사후 평균 + κ*σ (관측 가능 범위로 클리핑)
      const maxRange = hi + (hi - lo) * 0.3;
      const minRange = lo - (hi - lo) * 0.3;
      const ucbValue = Math.max(minRange, Math.min(maxRange, muPost + kappa * sigPost));
      suggestions.push({
        label: FEATURE_LABEL[f],
        suggestValue: Math.round(ucbValue * 100) / 100,
        unit: UNIT[f],
        reason: `사후 불확실성 ${Math.round(uncertaintyRatio * 100)}% 잔존 (σ_post=${sigPost.toFixed(2)}) — UCB 탐색점 ${Math.round(ucbValue * 100) / 100}${UNIT[f]} 실험으로 베이지안 레시피 갱신`,
      });
    }
  });

  return {
    suggestions,
    note: suggestions.length > 0
      ? `${suggestions.length}개 요인의 사후분산이 사전의 50% 이상 — UCB(기대상한) 획득함수 기반 실험점 제안. 이 조건 실험 후 베이지안 업데이트로 레시피 정밀도↑`
      : `모든 요인의 사후 불확실성이 사전의 50% 미만 — 현 레시피 신뢰도 충분, 추가 실험 불요.`,
  };
}

// ── 통합 오케스트레이터 + 결정론적 데모 데이터 ───────────────────────────────
// 합성 데이터: 실 환경 분포 위에 농학 반응으로 수율 합성(재현 시드).
// 상호작용항 추가(temp×co2, ec×dli)로 독립 최적화 한계 시험.
// — 실 수율 라벨은 1호점 수확 기록에서 확정.
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
    // 주효과(이차 페널티) + 쌍상호작용항 — 독립 1D 최적화로는 포착 못 하는 결합 효과
    const y = Math.max(
      0.3,
      5 - (
        0.03 * (env.temp - OPT.temp) ** 2 +
        8e-6 * (env.co2 - OPT.co2) ** 2 +
        0.02 * (env.dli - OPT.dli) ** 2 +
        0.8 * (env.ec - OPT.ec) ** 2 +
        0.6 * (env.ph - OPT.ph) ** 2 +
        0.004 * (env.humidity - OPT.humidity) ** 2
      )
      + 0.01 * (env.temp - OPT.temp) * (env.co2 - OPT.co2)   // temp×CO₂ 시너지
      + 0.005 * (env.ec - OPT.ec) * (env.dli - OPT.dli)      // EC×DLI 시너지
      + (rand() - 0.5) * 0.3
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
