// ── AI 생육레시피 분석 알고리즘 ──────────────────────────────────────────────
// 스케줄링(어떻게 싸게 달성)의 짝: "무엇을 목표로 할지"(최적 환경 = 생육레시피)를
// 데이터에서 학습한다. v15 기획: 환경 데이터↔수확량 상관 분석 → 최적 생육조건
// 도출 → 비전공 운영자의 진입장벽 완화.
//
// 3단계:
//   ① 특성 중요도 (그래디언트 부스팅): 어느 환경 요인이 수율을 좌우하나
//   ② 반응표면 최적점: 각 요인의 수율 최대 설정값 (2차 반응 곡선의 정점)
//   ③ 갭 분석: 현재 사이트 조건 vs 최적 레시피 → 실행 권고 + 예상 수율 상방
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
  left: number; // 예측값
  right: number;
  gain: number; // 분산감소 (특성 중요도 집계용)
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
  optimum: number; // 수율 최대 설정값
  current: number; // 현 사이트 평균
  unit: string;
}

export interface GrowthRecipe {
  samples: number;
  importance: RecipeImportance[]; // 중요도순
  recipe: RecipeSetpoint[];
  modelR2: number; // 학습 적합도
  note: string;
}

const UNIT: Record<string, string> = { temp: "℃", humidity: "%", co2: "ppm", ec: "dS/m", ph: "", dli: "mol" };

// ── ① 그래디언트 부스팅으로 특성 중요도, ② 반응표면으로 최적점 ──────────────
export function analyzeGrowthRecipe(obs: GrowthObservation[], opts?: {
  rounds?: number; // 부스팅 라운드
  learningRate?: number;
}): GrowthRecipe {
  const n = obs.length;
  const X = obs.map((o) => FEATURES.map((f) => o[f]));
  const y = obs.map((o) => o.yield);
  const rounds = opts?.rounds ?? 40;
  const lr = opts?.learningRate ?? 0.2;

  // 그래디언트 부스팅 (제곱손실 → 잔차 피팅)
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

  // 적합도 R²
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const ssRes = y.reduce((s, yi, i) => s + (yi - pred[i]) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // 특성 중요도 정규화 + 상관
  const gainSum = importanceGain.reduce((a, b) => a + b, 0) || 1;
  const corr = (f: number) => {
    const xf = X.map((x) => x[f]);
    const xm = xf.reduce((a, b) => a + b, 0) / n;
    const ym = yMean;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xf[i] - xm) * (y[i] - ym);
      dx += (xf[i] - xm) ** 2;
      dy += (y[i] - ym) ** 2;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };
  const importance: RecipeImportance[] = FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    importance: Math.round((importanceGain[i] / gainSum) * 1000) / 1000,
    correlation: Math.round(corr(i) * 100) / 100,
  })).sort((a, b) => b.importance - a.importance);

  // ② 반응표면: 각 변수에 대해 수율 2차 회귀 y = a·x² + b·x + c, 정점 = -b/2a
  const recipe: RecipeSetpoint[] = FEATURES.map((f, fi) => {
    const xf = X.map((x) => x[fi]);
    // 정규방정식으로 2차 최소제곱 (x, x²)
    const sx = xf.reduce((a, b) => a + b, 0);
    const sx2 = xf.reduce((a, b) => a + b * b, 0);
    const sx3 = xf.reduce((a, b) => a + b ** 3, 0);
    const sx4 = xf.reduce((a, b) => a + b ** 4, 0);
    const sy = y.reduce((a, b) => a + b, 0);
    const sxy = xf.reduce((a, b, i) => a + b * y[i], 0);
    const sx2y = xf.reduce((a, b, i) => a + b * b * y[i], 0);
    // 3x3 선형계 풀이 (c, b, a) : [[n,sx,sx2],[sx,sx2,sx3],[sx2,sx3,sx4]]·[c,b,a]=[sy,sxy,sx2y]
    const sol = solve3(
      [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]],
      [sy, sxy, sx2y]
    );
    const [, b, a] = sol;
    const lo = Math.min(...xf), hi = Math.max(...xf);
    let optimum: number;
    if (a < 0 && b !== 0) optimum = Math.max(lo, Math.min(hi, -b / (2 * a))); // 오목 정점
    else optimum = b > 0 ? hi : lo; // 단조면 경계
    const current = xf.reduce((s, v) => s + v, 0) / n;
    return {
      feature: f,
      label: FEATURE_LABEL[f],
      optimum: Math.round(optimum * 100) / 100,
      current: Math.round(current * 100) / 100,
      unit: UNIT[f],
    };
  });

  const top = importance[0];
  return {
    samples: n,
    importance,
    recipe,
    modelR2: Math.round(r2 * 100) / 100,
    note: `${n}개 사이클 학습(R²=${Math.round(r2 * 100) / 100}). 수율 최대 요인: ${top.label}(중요도 ${Math.round(
      top.importance * 100
    )}%). 각 요인의 최적 설정값을 반응표면 정점으로 도출 — 비전공 운영자도 따라할 수 있는 레시피.`,
  };
}

// 3×3 선형계 (가우스 소거)
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

// ── ③ 갭 분석: 현재 조건 vs 최적 레시피 → 실행 권고 ──────────────────────────
export interface RecipeAction {
  label: string;
  current: number;
  target: number;
  direction: "상향" | "하향" | "유지";
  importance: number;
  predictedYieldUpliftPct: number; // 이 요인만 최적화 시 예상 수율 상방
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
  const actions: RecipeAction[] = recipe.recipe.map((sp): RecipeAction => {
    const cur = current[sp.feature as keyof typeof current] ?? sp.current;
    const gap = sp.optimum - cur;
    const relGap = sp.optimum !== 0 ? Math.abs(gap) / Math.abs(sp.optimum) : 0;
    const imp = impMap.get(sp.feature) ?? 0;
    // 예상 수율 상방 ≈ 중요도 × 상대격차 (근사, 실측 전 참고치)
    const uplift = Math.round(imp * relGap * 100 * 10) / 10;
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

  const total = Math.round(actions.reduce((s, a) => s + a.predictedYieldUpliftPct, 0) * 10) / 10;
  const top = actions[0];
  return {
    actions,
    totalPotentialUpliftPct: total,
    headline:
      top && top.direction !== "유지"
        ? `${top.label}을(를) ${top.current}${recipe.recipe.find((r) => r.label === top.label)?.unit ?? ""} → ${top.target} ${top.direction}이 최우선 (예상 수율 +${top.predictedYieldUpliftPct}%). 전체 최적화 시 최대 +${total}% 상방.`
        : `현재 조건이 최적 레시피에 근접 — 유지 권장.`,
  };
}
