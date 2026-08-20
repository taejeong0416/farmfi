// ── AI 생육레시피 분석 알고리즘 ──────────────────────────────────────────────
// 스케줄링(어떻게 싸게 달성)의 짝: "무엇을 목표로 할지"(최적 환경 = 생육레시피)를
// 데이터에서 학습한다. v15 기획: 환경 데이터↔수확량 상관 분석 → 최적 생육조건
// 도출 → 비전공 운영자의 진입장벽 완화.
//
// 3단계:
//   ① 특성 중요도 (그래디언트 부스팅): 어느 환경 요인이 수율을 좌우하나
//   ② 다변량 반응표면 최적점: 주효과 + 쌍상호작용항(temp*co2, ec*dli, temp*humidity)으로
//      6D 결합 최적점 도출 (독립 1D ≠ 6D 결합 최적 — 상호작용 반영)
//   ③ 갭 분석: 현재 사이트 조건 vs 최적 레시피 → 실행 권고 + 모델 기반 수율 상방
//
// crop-profiles의 하드코딩 목표(DLI·정상범위)를 데이터가 대체하고, 그 학습된
// 목표를 최적화 스택이 효율적으로 달성한다 — 두 시스템이 맞물린다.

import { fromNormalized, toNormalized } from "./crop-normalize";

export interface GrowthObservation {
  temp: number; // ℃
  humidity: number; // %
  co2: number; // ppm
  ec: number; // dS/m
  ph: number;
  dli: number; // mol/m²/day
  yield: number; // kg/㎡ (사이클 수확량)
  /** 어느 품종의 사이클인가. 품종을 가로지르는 이전 강도를 이 값으로 정한다 */
  cropKey?: string;
}

export const FEATURES = ["temp", "humidity", "co2", "ec", "ph", "dli"] as const;
export type GrowthFeature = (typeof FEATURES)[number];

export const FEATURE_LABEL: Record<string, string> = {
  temp: "온도",
  humidity: "습도",
  co2: "CO₂",
  ec: "양액EC",
  ph: "양액pH",
  dli: "광량(DLI)",
};

// ── 회귀 스텀프 (깊이 1 결정트리) — 그래디언트 부스팅의 약학습기 ──────────────
interface Stump {
  feature: number;
  threshold: number;
  left: number;
  right: number;
  gain: number;
}

function fitStump(X: number[][], residual: number[]): Stump {
  let best: Stump = { feature: 0, threshold: 0, left: 0, right: 0, gain: -Infinity };
  const n = X.length;
  const totalMean = residual.reduce((a, b) => a + b, 0) / n;
  const totalVar = residual.reduce((s, r) => s + (r - totalMean) ** 2, 0);

  for (let f = 0; f < FEATURES.length; f++) {
    const vals = [...new Set(X.map((x) => x[f]))].sort((a, b) => a - b);
    for (let ti = 0; ti < vals.length - 1; ti++) {
      const th = (vals[ti] + vals[ti + 1]) / 2;
      let lSum = 0, lN = 0, rSum = 0, rN = 0;
      for (let i = 0; i < n; i++) {
        if (X[i][f] <= th) { lSum += residual[i]; lN++; }
        else { rSum += residual[i]; rN++; }
      }
      if (lN === 0 || rN === 0) continue;
      const lMean = lSum / lN, rMean = rSum / rN;
      let sse = 0;
      for (let i = 0; i < n; i++) {
        const pred = X[i][f] <= th ? lMean : rMean;
        sse += (residual[i] - pred) ** 2;
      }
      const gain = totalVar - sse;
      if (gain > best.gain) best = { feature: f, threshold: th, left: lMean, right: rMean, gain };
    }
  }
  return best;
}

export interface RecipeImportance {
  feature: string;
  label: string;
  importance: number; // 정규화 0~1
  correlation: number; // 수율과의 피어슨 상관
}

export interface RecipeSetpoint {
  feature: string;
  label: string;
  optimum: number; // 다변량 반응표면 결합 최적점
  current: number; // 현 사이트 평균
  unit: string;
  /**
   * 최적점이 탐색범위 끝에 붙었나. 붙었다면 반응표면이 그 방향으로 계속 올라간다는
   * 뜻이고, 표시된 값은 "여기가 최적"이 아니라 "여기까지밖에 못 본다"는 뜻이다.
   */
  atBoundary: boolean;
}

/**
 * 적합된 반응표면이 실제로 최대점을 갖는가. 이차형식이 안장이면 좌표상승은 상자
 * 모서리를 답으로 내놓는데, 그 값은 최적점이 아니라 관측범위의 끝일 뿐이다.
 */
export type SurfaceVerdict = "최대점" | "안장점" | "판정불가";

export interface GrowthRecipe {
  samples: number;
  importance: RecipeImportance[];
  recipe: RecipeSetpoint[];
  /** 5-fold CV R². 표본이 파라미터 수에 못 미치면 null — 0은 "설명력 없음"이라 뜻이 다르다 */
  modelR2: number | null;
  surface: SurfaceVerdict;
  note: string;
  _beta?: number[]; // 정규화 좌표에서의 반응표면 계수 (갭 분석이 다시 쓴다)
  _cropKey?: string; // _beta가 어느 품종의 좌표계인지
}

export const UNIT: Record<string, string> = { temp: "℃", humidity: "%", co2: "ppm", ec: "dS/m", ph: "", dli: "mol" };

// ── 다변량 반응표면 설계행렬 (16열) ─────────────────────────────────────────
// FEATURES 순서: [temp(0), humidity(1), co2(2), ec(3), ph(4), dli(5)]
// 열: [1, f0,f1,f2,f3,f4,f5, f0²,f1²,f2²,f3²,f4²,f5², f0*f2(temp*co2), f3*f5(ec*dli), f0*f1(temp*hum)]
const NPARAMS = 16;

function buildDesignRow(x: number[]): number[] {
  const [f0, f1, f2, f3, f4, f5] = x;
  return [
    1, f0, f1, f2, f3, f4, f5,
    f0 * f0, f1 * f1, f2 * f2, f3 * f3, f4 * f4, f5 * f5,
    f0 * f2, f3 * f5, f0 * f1,
  ];
}

function dotV(a: number[], b: number[]): number {
  return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

function predictRS(beta: number[], x: number[]): number {
  return dotV(beta, buildDesignRow(x));
}

// ── 재적합 원시함수 ──────────────────────────────────────────────────────────
// 부트스트랩은 같은 적합을 수백 번 되풀이한다. analyzeGrowthRecipe 전체를 돌리면
// 부스팅·교차검증까지 딸려와 느리므로, 표면 적합과 최적화만 따로 내어 쓴다.
// 입력·출력 모두 정규화 좌표다.

/** 정규화 좌표 관측에서 반응표면 계수를 적합한다. */
export function fitResponseSurface(Z: number[][], y: number[]): number[] {
  return olsFit(Z.map(buildDesignRow), y);
}

/** 계수와 탐색범위에서 6D 결합 최적점(정규화 좌표)을 찾는다. */
export function optimumZ(beta: number[], bounds: [number, number][]): number[] {
  return coordinateAscent(beta, bounds);
}

export function predictSurface(beta: number[], z: number[]): number {
  return predictRS(beta, z);
}

/**
 * 탐색범위 = 관측범위 ∩ 농학 정상범위. z에서 농학 정상범위는 정의상 [-1,1]이다.
 * clamp를 끄면 관측범위만 쓴다 — 농학 지식이 답을 대신 내지 않는지 볼 때 필요하다.
 */
export function zBounds(Z: number[][], clamp: boolean): [number, number][] {
  return FEATURES.map((_, fi) => {
    const vals = Z.map((z) => z[fi]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (!clamp) return [lo, hi];
    const cLo = Math.max(lo, -1);
    const cHi = Math.min(hi, 1);
    // 교집합이 비면 관측범위로 물러선다 — 외삽하느니 못 봤다고 하는 편이 낫다
    return (cLo < cHi ? [cLo, cHi] : [lo, hi]) as [number, number];
  });
}

// OLS 정규방정식: (D^T D + λI) β = D^T y (λ=1e-6 릿지 정규화로 수치 안정)
function olsFit(D: number[][], y: number[]): number[] {
  const p = D[0].length;
  const n = D.length;
  const A: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const b: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += D[i][j] * y[i];
      for (let k = j; k < p; k++) {
        A[j][k] += D[i][j] * D[i][k];
        A[k][j] = A[j][k];
      }
    }
  }
  for (let j = 0; j < p; j++) A[j][j] += 1e-6; // 릿지 정규화
  return gaussianElimP(A, b);
}

// p×p 가우스 소거 (부분 피벗팅)
function gaussianElimP(A: number[][], b: number[]): number[] {
  const p = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-10) continue;
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= p; k++) M[r][k] -= f * M[c][k];
    }
  }
  return Array.from({ length: p }, (_, i) =>
    Math.abs(M[i][i]) < 1e-10 ? 0 : M[i][p] / M[i][i]
  );
}

// 좌표 상승 (각 변수 1D 최적화 반복 → 6D 결합 최적점)
// 각 xi에 대한 1D 서브문제: f(xi) = β_quad*xi² + (β_lin + Σ interaction) * xi + const
function coordinateAscent(beta: number[], bounds: [number, number][], maxIter = 200): number[] {
  const x = bounds.map(([lo, hi]) => (lo + hi) / 2);
  for (let iter = 0; iter < maxIter; iter++) {
    let converged = true;
    for (let i = 0; i < 6; i++) {
      const bQuad = beta[7 + i]; // 2차 주효과 계수
      let bLin = beta[1 + i];   // 1차 주효과 계수
      // 상호작용항에서 xi가 포함된 열의 기여 추가
      // col 13 = temp*co2:  i=0 → co2 고정값 곱, i=2 → temp 고정값 곱
      // col 14 = ec*dli:    i=3 → dli 고정값 곱, i=5 → ec 고정값 곱
      // col 15 = temp*hum:  i=0 → hum 고정값 곱, i=1 → temp 고정값 곱
      if (i === 0) bLin += beta[13] * x[2] + beta[15] * x[1];
      else if (i === 1) bLin += beta[15] * x[0];
      else if (i === 2) bLin += beta[13] * x[0];
      else if (i === 3) bLin += beta[14] * x[5];
      else if (i === 5) bLin += beta[14] * x[3];

      const [lo, hi] = bounds[i];
      let xi: number;
      if (bQuad < -1e-10) {
        xi = Math.max(lo, Math.min(hi, -bLin / (2 * bQuad)));
      } else {
        const fLo = bQuad * lo * lo + bLin * lo;
        const fHi = bQuad * hi * hi + bLin * hi;
        xi = fHi >= fLo ? hi : lo;
      }
      if (Math.abs(xi - x[i]) > 1e-5) converged = false;
      x[i] = xi;
    }
    if (converged) break;
  }
  return x;
}

// ── 표면 진단: 이 이차형식이 최대점을 갖는가 ────────────────────────────────
// 헤시안 H가 음정부호여야 정류점이 최대다. 안장이면 좌표상승이 상자 모서리를
// 답으로 내는데, 화면에는 그것도 "최적 22.3℃"로 똑같이 보인다. 둘을 구분한다.
// 비대각 성분은 설계행렬에 넣은 세 쌍뿐이다 — 13:temp×co2, 14:ec×dli, 15:temp×hum.
function surfaceVerdict(beta: number[]): SurfaceVerdict {
  const n = 6;
  const H: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) H[i][i] = 2 * beta[7 + i];
  const setPair = (i: number, j: number, v: number) => {
    H[i][j] = v;
    H[j][i] = v;
  };
  setPair(0, 2, beta[13]);
  setPair(3, 5, beta[14]);
  setPair(0, 1, beta[15]);

  // −H의 촐레스키가 성공하면 H는 음정부호 = 최대점
  // 곡률이 통째로 사라진 적합(랭크 부족·표본 부족)은 안장이 아니라 판정불가다
  if (H.every((row, i) => Math.abs(row[i]) < 1e-9)) return "판정불가";

  const M = H.map((row) => row.map((v) => -v));
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return "안장점";
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return "최대점";
}

// 5-fold 교차검증 R² (훈련 R² 대신 — 과적합 제어)
function cvR2(X: number[][], y: number[], nFolds = 5): number | null {
  const n = X.length;
  if (n < NPARAMS * 2) return null; // 표본이 파라미터의 2배 미만 — 판정 자체가 불가
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const foldSize = Math.floor(n / nFolds);
  let ssRes = 0, ssTot = 0;
  for (let fold = 0; fold < nFolds; fold++) {
    const ts = fold * foldSize;
    const te = fold === nFolds - 1 ? n : ts + foldSize;
    const trainD = [
      ...X.slice(0, ts).map(buildDesignRow),
      ...X.slice(te).map(buildDesignRow),
    ];
    const trainY = [...y.slice(0, ts), ...y.slice(te)];
    const beta = olsFit(trainD, trainY);
    for (let i = ts; i < te; i++) {
      ssRes += (y[i] - predictRS(beta, X[i])) ** 2;
      ssTot += (y[i] - yMean) ** 2;
    }
  }
  return ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
}

// ── ① 그래디언트 부스팅으로 특성 중요도, ② 다변량 반응표면으로 결합 최적점 ──────
export function analyzeGrowthRecipe(obs: GrowthObservation[], opts?: {
  rounds?: number;
  learningRate?: number;
  cropKey?: string; // 농학 정상범위와 관측범위 교집합으로 외삽 방지
}): GrowthRecipe {
  const n = obs.length;
  const cropKey = opts?.cropKey ?? obs.find((o) => o.cropKey)?.cropKey;
  // 학습은 정규화 좌표에서 한다. 원시 단위로 적합하면 co2² 열이 1e6 규모가 되어
  // 설계행렬 조건수가 무너지고, 무엇보다 품종이 섞인 관측을 한 표면에 올릴 수 없다.
  // z는 관측마다 그 관측의 품종 기준으로 잡으므로 상추 사이클과 바질 사이클이
  // 같은 좌표계에서 만난다.
  const X = obs.map((o) => toNormalized(o, o.cropKey ?? cropKey));
  const y = obs.map((o) => o.yield);
  const rounds = opts?.rounds ?? 40;
  const lr = opts?.learningRate ?? 0.2;

  // ① 그래디언트 부스팅으로 특성 중요도 (gain 기반)
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let pred = Array(n).fill(yMean);
  const importanceGain = Array(FEATURES.length).fill(0);
  for (let r = 0; r < rounds; r++) {
    const residual = y.map((yi, i) => yi - pred[i]);
    const stump = fitStump(X, residual);
    if (stump.gain <= 0) break;
    importanceGain[stump.feature] += stump.gain;
    for (let i = 0; i < n; i++) {
      pred[i] += lr * (X[i][stump.feature] <= stump.threshold ? stump.left : stump.right);
    }
  }

  // ② 다변량 반응표면 적합 (주효과 + 이차항 + 쌍상호작용)
  const D = X.map(buildDesignRow);
  const beta = olsFit(D, y);

  // 5-fold CV R²
  const r2 = cvR2(X, y);

  // 다항식 외삽(temp 14.8℃ 같은 비현실값)을 막기 위해 농학 정상범위로 클램프한다
  const bounds = zBounds(X, Boolean(cropKey));

  // 6D 결합 최적점 (좌표 상승 — 독립 1D 최적 ≠ 결합 최적)
  const optZ = coordinateAscent(beta, bounds);
  const optPhysical = fromNormalized(optZ, cropKey);
  // 끝에 붙은 요인은 "여기가 최적"이 아니라 "여기까지밖에 못 봤다"는 뜻이다
  const boundaryTol = 1e-4;
  const atBoundary = optZ.map(
    (z, i) => Math.abs(z - bounds[i][0]) < boundaryTol || Math.abs(z - bounds[i][1]) < boundaryTol
  );

  // 특성 중요도 정규화 + 상관
  const gainSum = importanceGain.reduce((a, b) => a + b, 0) || 1;
  const corr = (f: number) => {
    const xf = X.map((x) => x[f]);
    const xm = xf.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xf[i] - xm) * (y[i] - yMean);
      dx += (xf[i] - xm) ** 2;
      dy += (y[i] - yMean) ** 2;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };
  const importance: RecipeImportance[] = FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    importance: Math.round((importanceGain[i] / gainSum) * 1000) / 1000,
    correlation: Math.round(corr(i) * 100) / 100,
  })).sort((a, b) => b.importance - a.importance);

  // 현 사이트 평균은 물리 단위 그대로 — 운영자가 계기에서 읽는 값이다
  const recipe: RecipeSetpoint[] = FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    optimum: Math.round(optPhysical[f] * 100) / 100,
    current: Math.round((obs.reduce((s, o) => s + o[f], 0) / n) * 100) / 100,
    unit: UNIT[f],
    atBoundary: atBoundary[i],
  }));

  const top = importance[0];
  const surface = surfaceVerdict(beta);
  const bounded = recipe.filter((r) => r.atBoundary).map((r) => r.label);

  const fitPart =
    r2 === null
      ? `${n}개 사이클 학습 — 파라미터 ${NPARAMS}개에 비해 표본이 적어 설명력 판정 불가`
      : `${n}개 사이클 학습(5-fold CV R²=${Math.round(r2 * 100) / 100})`;
  const surfacePart =
    surface === "최대점"
      ? "반응표면이 내부 최대점을 갖는다"
      : surface === "안장점"
        ? "반응표면이 안장이라 표시된 값은 최적점이 아니라 탐색범위의 끝이다"
        : "곡률이 잡히지 않아 최적점을 판정할 수 없다";
  const boundPart = bounded.length ? ` 탐색범위 끝에 붙은 요인: ${bounded.join("·")}.` : "";

  return {
    samples: n,
    importance,
    recipe,
    modelR2: r2 === null ? null : Math.round(r2 * 100) / 100,
    surface,
    note: `${fitPart}. 수율 최대 요인: ${top.label}(중요도 ${Math.round(
      top.importance * 100
    )}%). 주효과+이차항+쌍상호작용(온도×CO₂·EC×DLI·온도×습도) 다변량 반응표면의 6D 결합 최적점 — ${surfacePart}.${boundPart}`,
    _beta: beta,
    _cropKey: cropKey,
  };
}

// ── ③ 갭 분석: 현재 조건 vs 최적 레시피 → 실행 권고 ──────────────────────────
// 요인별 상방을 "이 요인만 옮겼을 때의 차이"로 재면 상호작용 때문에 부분의 합이
// 전체와 맞지 않는다. 화면은 그 둘을 나란히 놓으므로 어긋나면 바로 들킨다.
// 섀플리 분해를 쓰면 Σφ_i = f(전부 최적) − f(전부 현재)가 항등식으로 성립한다.
// 여기서 연합은 "그 요인들만 최적으로 옮긴 상태"이고, 요인 6개라 2^6=64로 정확계산.
export interface RecipeAction {
  label: string;
  current: number;
  target: number;
  direction: "상향" | "하향" | "유지";
  importance: number;
  /** 섀플리 배분 상방(%). 음수면 그 요인만 따로 옮기는 것이 오히려 손해라는 뜻 */
  predictedYieldUpliftPct: number;
  /** 최적점이 탐색범위 끝이라 권고의 근거가 약한 요인 */
  atBoundary: boolean;
}

export interface RecipeGapReport {
  actions: RecipeAction[];
  totalPotentialUpliftPct: number;
  headline: string;
}

export function recipeGapAnalysis(
  recipe: GrowthRecipe,
  current: Partial<Record<GrowthFeature, number>>
): RecipeGapReport {
  const impMap = new Map(recipe.importance.map((i) => [i.feature, i.importance]));
  const spMap = new Map(recipe.recipe.map((sp) => [sp.feature, sp]));
  const nF = FEATURES.length;

  // 물리 단위로 받아 학습 좌표계로 옮긴다 — _beta는 정규화 좌표의 계수다
  const asObs = (pick: (f: GrowthFeature) => number): GrowthObservation =>
    ({
      ...(Object.fromEntries(FEATURES.map((f) => [f, pick(f)])) as Record<GrowthFeature, number>),
      yield: 0,
    });
  const currentPhys = (f: GrowthFeature) => current[f] ?? spMap.get(f)?.current ?? 0;
  const optimalPhys = (f: GrowthFeature) => spMap.get(f)?.optimum ?? currentPhys(f);
  const curZ = toNormalized(asObs(currentPhys), recipe._cropKey);
  const optZ = toNormalized(asObs(optimalPhys), recipe._cropKey);

  const beta = recipe._beta;
  const yHatCurrent = beta ? predictRS(beta, curZ) : null;
  const yHatOptimal = beta ? predictRS(beta, optZ) : null;
  // 예측 수율이 0 이하면 비율 자체가 뜻을 잃는다 — 상방을 말하지 않는다
  const scalable = beta && yHatCurrent !== null && yHatCurrent > 0.01;

  // 섀플리 배분: 연합 S = "S에 든 요인만 최적으로 옮긴 상태"
  const shapleyPct = (): number[] => {
    if (!beta || !scalable || yHatCurrent === null) return Array(nF).fill(0);
    const cache = new Map<number, number>();
    const v = (mask: number) => {
      const hit = cache.get(mask);
      if (hit !== undefined) return hit;
      const z = FEATURES.map((_, i) => ((mask >> i) & 1 ? optZ[i] : curZ[i]));
      const val = predictRS(beta, z);
      cache.set(mask, val);
      return val;
    };
    const fact = (k: number) => {
      let r = 1;
      for (let i = 2; i <= k; i++) r *= i;
      return r;
    };
    const nFact = fact(nF);
    const phi = Array(nF).fill(0);
    for (let i = 0; i < nF; i++) {
      for (let mask = 0; mask < 1 << nF; mask++) {
        if ((mask >> i) & 1) continue;
        let s = 0;
        for (let b = mask; b; b >>= 1) s += b & 1;
        phi[i] += ((fact(s) * fact(nF - s - 1)) / nFact) * (v(mask | (1 << i)) - v(mask));
      }
    }
    return phi.map((p) => Math.round((p / yHatCurrent) * 1000) / 10);
  };
  const phiPct = shapleyPct();

  const actions: RecipeAction[] = recipe.recipe
    .map((sp): RecipeAction => {
      const fi = FEATURES.indexOf(sp.feature as GrowthFeature);
      const cur = currentPhys(sp.feature as GrowthFeature);
      const gap = sp.optimum - cur;
      // 계측 잡음 안에서 흔들리는 차이를 조작 지시로 바꾸지 않는다 — 범위폭의 2%
      const half = Math.abs(sp.optimum - sp.current) || Math.abs(sp.optimum) || 1;
      const deadband = 0.02 * half;
      return {
        label: sp.label,
        current: Math.round(cur * 100) / 100,
        target: sp.optimum,
        direction: Math.abs(gap) < deadband ? "유지" : gap > 0 ? "상향" : "하향",
        importance: impMap.get(sp.feature) ?? 0,
        predictedYieldUpliftPct: phiPct[fi],
        atBoundary: sp.atBoundary,
      };
    })
    .sort((a, b) => b.predictedYieldUpliftPct - a.predictedYieldUpliftPct);

  // 전체 상방 = 현재 → 전부 최적. 섀플리 분해라 부분의 합과 항등으로 맞는다.
  const total =
    scalable && yHatOptimal !== null && yHatCurrent !== null
      ? Math.round(((yHatOptimal - yHatCurrent) / yHatCurrent) * 1000) / 10
      : 0;

  const top = actions[0];
  return {
    actions,
    totalPotentialUpliftPct: total,
    headline:
      recipe.surface !== "최대점"
        ? `반응표면이 ${recipe.surface}이라 권고를 내지 않는다 — 표시된 값은 최적점이 아니라 탐색범위의 끝이다.`
        : top && top.direction !== "유지"
          ? `${top.label}을(를) ${top.current}${recipe.recipe.find((r) => r.label === top.label)?.unit ?? ""} → ${top.target} ${top.direction}이 최우선 (모델 예측 수율 ${top.predictedYieldUpliftPct >= 0 ? "+" : ""}${top.predictedYieldUpliftPct}%). 전체 최적화 시 ${total >= 0 ? "+" : ""}${total}% 상방.${top.atBoundary ? " 다만 이 요인은 탐색범위 끝이라 더 올릴 여지가 확인되지 않았다." : ""}`
          : `현재 조건이 최적 레시피에 근접 — 유지 권장.`,
  };
}
