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

export interface GrowthObservation {
  temp: number; // ℃
  humidity: number; // %
  co2: number; // ppm
  ec: number; // dS/m
  ph: number;
  dli: number; // mol/m²/day
  yield: number; // kg/㎡ (사이클 수확량)
}

const FEATURES: (keyof Omit<GrowthObservation, "yield">)[] = [
  "temp",
  "humidity",
  "co2",
  "ec",
  "ph",
  "dli",
];

const FEATURE_LABEL: Record<string, string> = {
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
}

export interface GrowthRecipe {
  samples: number;
  importance: RecipeImportance[];
  recipe: RecipeSetpoint[];
  modelR2: number; // 5-fold CV R²
  note: string;
  _beta?: number[]; // 다변량 반응표면 계수 (갭분석 모델 기반 수율 상방 산출용)
}

const UNIT: Record<string, string> = { temp: "℃", humidity: "%", co2: "ppm", ec: "dS/m", ph: "", dli: "mol" };

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

// 5-fold 교차검증 R² (훈련 R² 대신 — 과적합 제어)
function cvR2(X: number[][], y: number[], nFolds = 5): number {
  const n = X.length;
  if (n < NPARAMS * 2) return 0; // 표본 부족 시 신뢰 불가
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
}): GrowthRecipe {
  const n = obs.length;
  const X = obs.map((o) => FEATURES.map((f) => o[f]));
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

  // 각 변수의 관측 범위 (좌표 상승 탐색 범위)
  const bounds: [number, number][] = FEATURES.map((_, fi) => {
    const vals = X.map((x) => x[fi]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const slack = (hi - lo) * 0.1 || 1;
    return [lo - slack, hi + slack] as [number, number];
  });

  // 6D 결합 최적점 (좌표 상승 — 독립 1D 최적 ≠ 결합 최적)
  const optX = coordinateAscent(beta, bounds);

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

  const recipe: RecipeSetpoint[] = FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    optimum: Math.round(optX[i] * 100) / 100,
    current: Math.round((X.map((x) => x[i]).reduce((a, b) => a + b, 0) / n) * 100) / 100,
    unit: UNIT[f],
  }));

  const top = importance[0];
  return {
    samples: n,
    importance,
    recipe,
    modelR2: Math.round(r2 * 100) / 100,
    note: `${n}개 사이클 학습(5-fold CV R²=${Math.round(r2 * 100) / 100}). 수율 최대 요인: ${top.label}(중요도 ${Math.round(
      top.importance * 100
    )}%). 주효과+이차항+쌍상호작용(온도×CO₂·EC×DLI·온도×습도) 다변량 반응표면의 6D 결합 최적점 도출.`,
    _beta: beta,
  };
}

// ── ③ 갭 분석: 현재 조건 vs 최적 레시피 → 실행 권고 ──────────────────────────
export interface RecipeAction {
  label: string;
  current: number;
  target: number;
  direction: "상향" | "하향" | "유지";
  importance: number;
  predictedYieldUpliftPct: number; // 모델 기반 — 이 요인만 최적화 시 예상 수율 상방
}

export interface RecipeGapReport {
  actions: RecipeAction[];
  totalPotentialUpliftPct: number;
  headline: string;
}

export function recipeGapAnalysis(
  recipe: GrowthRecipe,
  current: Partial<Record<keyof Omit<GrowthObservation, "yield">, number>>
): RecipeGapReport {
  const impMap = new Map(recipe.importance.map((i) => [i.feature, i.importance]));
  const spMap = new Map(recipe.recipe.map((sp) => [sp.feature, sp]));

  // 현재 조건 벡터 (feature 순서대로)
  const currentX = FEATURES.map((f) => {
    const sp = spMap.get(f);
    return current[f as keyof typeof current] ?? sp?.current ?? 0;
  });
  const optimalX = FEATURES.map((f) => spMap.get(f)?.optimum ?? currentX[FEATURES.indexOf(f)]);

  // 모델 기반 수율 예측 (beta 존재 시)
  const beta = recipe._beta;
  const yHatCurrent = beta ? predictRS(beta, currentX) : null;
  const yHatOptimal = beta ? predictRS(beta, optimalX) : null;

  const actions: RecipeAction[] = recipe.recipe.map((sp, idx): RecipeAction => {
    const fi = FEATURES.indexOf(sp.feature as keyof Omit<GrowthObservation, "yield">);
    const cur = currentX[fi];
    const gap = sp.optimum - cur;
    const imp = impMap.get(sp.feature) ?? 0;

    let uplift: number;
    if (beta && yHatCurrent !== null && Math.abs(yHatCurrent) > 0.01) {
      // 이 요인만 최적으로 이동했을 때 모델 예측 수율 차이 (상호작용 반영)
      const modX = [...currentX];
      modX[fi] = sp.optimum;
      const yHatMod = predictRS(beta, modX);
      uplift = Math.round(Math.max(0, (yHatMod - yHatCurrent) / Math.abs(yHatCurrent) * 1000)) / 10;
    } else {
      // 베타 없을 때 근사 (레거시 폴백)
      const relGap = sp.optimum !== 0 ? Math.abs(gap) / Math.abs(sp.optimum) : 0;
      uplift = Math.round(imp * relGap * 100 * 10) / 10;
    }

    const direction: RecipeAction["direction"] =
      Math.abs(gap) < 0.01 * Math.abs(sp.optimum || 1) ? "유지" : gap > 0 ? "상향" : "하향";
    return {
      label: sp.label,
      current: Math.round(cur * 100) / 100,
      target: sp.optimum,
      direction,
      importance: imp,
      predictedYieldUpliftPct: uplift,
    };
  }).sort((a, b) => b.predictedYieldUpliftPct - a.predictedYieldUpliftPct);

  // 전체 상방 = 현재 → 모든 요인 최적화 시 모델 예측 수율 차이
  let total: number;
  if (beta && yHatCurrent !== null && yHatOptimal !== null && Math.abs(yHatCurrent) > 0.01) {
    total = Math.round(Math.max(0, (yHatOptimal - yHatCurrent) / Math.abs(yHatCurrent) * 1000)) / 10;
  } else {
    total = Math.round(actions.reduce((s, a) => s + a.predictedYieldUpliftPct, 0) * 10) / 10;
  }

  const top = actions[0];
  return {
    actions,
    totalPotentialUpliftPct: total,
    headline:
      top && top.direction !== "유지"
        ? `${top.label}을(를) ${top.current}${recipe.recipe.find((r) => r.label === top.label)?.unit ?? ""} → ${top.target} ${top.direction}이 최우선 (모델 예측 수율 +${top.predictedYieldUpliftPct}%). 전체 최적화 시 +${total}% 상방.`
        : `현재 조건이 최적 레시피에 근접 — 유지 권장.`,
  };
}
