// ── AI 운영 최적화 — 프론티어 스택 (타 분야 최적화 이식) ─────────────────────
// 지금까지 안 푼 실제 문제에 다른 분야의 검증된 최적화를 매핑한다.
//
// [채택 — 데모 배선됨]
//   · 마코위츠(금융 포트폴리오) → 작물 배분의 리스크-수익 효율적 프론티어
//   · 베이불 생존분석(신뢰성)   → 예지보전을 "잔여수명(RUL)"으로 격상
// [로드맵 — 조건부, 미배선]
//   · 차량경로(VRP, 물류)      → 기사·배송 순회. 1인 1사이트 모델에선 순회 최적화
//                               여지가 작아 보류. 사이트 밀집·공동배송 시 재도입.
//   · 베이지안 최적화(실험설계) → 연속 레시피 공간 탐색. 경량 GP로는 표본 부족 시
//                               극단 탐색 → 제대로 된 가우시안 프로세스로 승격 후 채택.

// ── 프론티어 1: 차량경로최적화(VRP) — 기사·배송 순회 = 밀도 경제 실증 ────────
// "기사 1명이 인근 여러 사이트를 돈다"는 밀도 경제 주장을 실제 경로로 증명한다.
// 사이트 좌표 + 각 사이트의 서비스 시간으로, 하루 이동거리를 최소화하는 순회
// 경로를 구한다(TSP/VRP). 최근접 이웃 + 2-opt 개선 — 소규모(수십 사이트)에 실용적.
export interface Site2D {
  id: string;
  x: number; // km
  y: number;
}

export interface RoutePlan {
  order: string[];
  totalDistanceKm: number;
  naiveDistanceKm: number; // 방문 순서 그대로(비최적)
  savedKm: number;
  sitesPerTech: number;
  note: string;
}

function dist(a: Site2D, b: Site2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function routeLength(route: Site2D[]): number {
  let d = 0;
  for (let i = 0; i < route.length - 1; i++) d += dist(route[i], route[i + 1]);
  return d;
}

export function maintenanceRouting(opts: {
  depot: Site2D; // 기사 출발지(거점)
  sites: Site2D[];
  kmCostPer?: number; // 원/km (연료+시간)
}): RoutePlan {
  const all = [opts.depot, ...opts.sites];
  // 최근접 이웃 초기해
  const visited = new Set<number>([0]);
  const order = [0];
  while (order.length < all.length) {
    const last = all[order[order.length - 1]];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < all.length; i++) {
      if (visited.has(i)) continue;
      const d = dist(last, all[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    order.push(best);
    visited.add(best);
  }
  order.push(0); // 거점 복귀

  // 2-opt 개선
  const idx = [...order];
  const routeOf = (ix: number[]) => ix.map((i) => all[i]);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < idx.length - 2; i++) {
      for (let j = i + 1; j < idx.length - 1; j++) {
        const before = routeLength(routeOf(idx));
        const cand = [...idx];
        // 구간 뒤집기
        const seg = cand.slice(i, j + 1).reverse();
        cand.splice(i, seg.length, ...seg);
        if (routeLength(routeOf(cand)) < before - 1e-9) {
          idx.splice(0, idx.length, ...cand);
          improved = true;
        }
      }
    }
  }

  const optimal = routeLength(routeOf(idx));
  // 비최적: 사이트를 준 순서 그대로 방문
  const naive = routeLength(routeOf([0, ...opts.sites.map((_, i) => i + 1), 0]));

  return {
    order: idx.filter((i) => i !== 0).map((i) => all[i].id),
    totalDistanceKm: Math.round(optimal * 10) / 10,
    naiveDistanceKm: Math.round(naive * 10) / 10,
    savedKm: Math.round((naive - optimal) * 10) / 10,
    sitesPerTech: opts.sites.length,
    note: `기사 1명이 ${opts.sites.length}개 사이트를 ${Math.round(
      optimal
    )}km로 순회(비최적 ${Math.round(naive)}km 대비 -${Math.round(
      naive - optimal
    )}km). 사이트가 인접할수록 사이트당 이동이 줄어 밀도 경제가 성립.`,
  };
}

// ── 프론티어 2: 마코위츠 평균-분산 — 작물 포트폴리오 리스크-수익 ─────────────
// 금융 포트폴리오 이론(1952 Markowitz)을 작물 배분에 이식. 각 작물의 기대마진
// (수익)과 마진 변동성(리스크), 작물 간 상관을 넣어 "주어진 리스크에서 최대 수익"의
// 효율적 프론티어를 그린다. STO 투자 테마와 정확히 겹친다 — 작물도 포트폴리오다.
export interface CropAsset {
  name: string;
  expectedMargin: number; // 기대 마진 (원/트레이)
  volatility: number; // 마진 표준편차 (리스크)
}

export interface PortfolioPoint {
  weights: number[];
  expectedReturn: number;
  risk: number; // 표준편차
  sharpe: number; // 수익/리스크
}

export interface MeanVariancePlan {
  assets: string[];
  minVariance: PortfolioPoint; // 최소 리스크 포트폴리오
  maxSharpe: PortfolioPoint; // 리스크 대비 최고 수익
  frontier: PortfolioPoint[];
  note: string;
}

export function cropMeanVariance(opts: {
  assets: CropAsset[];
  correlation?: number; // 작물 간 평균 상관(기본 0.3 — 같은 지역 기상 리스크 공유)
  samples?: number;
  seed?: number;
}): MeanVariancePlan {
  const n = opts.assets.length;
  const corr = opts.correlation ?? 0.3;
  const N = opts.samples ?? 4000;
  // 공분산 행렬: cov[i][j] = corr(i,j) × σi × σj, 대각은 σ²
  const sig = opts.assets.map((a) => a.volatility);
  const cov = (i: number, j: number) =>
    (i === j ? 1 : corr) * sig[i] * sig[j];

  // 시드 PRNG
  let s = (opts.seed ?? 5) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const points: PortfolioPoint[] = [];
  for (let k = 0; k < N; k++) {
    // 무작위 가중치(디리클레 근사: 지수 정규화)
    const w = opts.assets.map(() => -Math.log(1 - rand()));
    const sum = w.reduce((a, b) => a + b, 0);
    const weights = w.map((x) => x / sum);
    const ret = weights.reduce((a, wi, i) => a + wi * opts.assets[i].expectedMargin, 0);
    let variance = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) variance += weights[i] * weights[j] * cov(i, j);
    const risk = Math.sqrt(variance);
    points.push({ weights, expectedReturn: ret, risk, sharpe: ret / risk });
  }

  const minVar = points.reduce((a, b) => (b.risk < a.risk ? b : a));
  const maxSharpe = points.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  // 프론티어: 리스크 구간별 최대 수익점 샘플
  const sorted = [...points].sort((a, b) => a.risk - b.risk);
  const frontier: PortfolioPoint[] = [];
  const step = Math.max(1, Math.floor(sorted.length / 12));
  let maxRet = -Infinity;
  for (let i = 0; i < sorted.length; i += step) {
    const slice = sorted.slice(i, i + step);
    const best = slice.reduce((a, b) => (b.expectedReturn > a.expectedReturn ? b : a));
    if (best.expectedReturn > maxRet) {
      maxRet = best.expectedReturn;
      frontier.push(best);
    }
  }

  const pct = (w: number[]) =>
    w.map((x, i) => `${opts.assets[i].name} ${Math.round(x * 100)}%`).join(" · ");
  return {
    assets: opts.assets.map((a) => a.name),
    minVariance: minVar,
    maxSharpe,
    frontier,
    note: `최대 샤프비(리스크 대비 수익) 배분: ${pct(
      maxSharpe.weights
    )} (기대 ${Math.round(maxSharpe.expectedReturn)}원, 리스크 ${Math.round(
      maxSharpe.risk
    )}). 최소리스크: ${pct(minVar.weights)}. 작물도 투자 포트폴리오처럼 분산.`,
  };
}

// ── 프론티어 3: 베이지안 최적화(GP) — 연속 레시피 공간 탐색 ─────────────────
// 레시피(광량·온도·EC 조합) 최적화는 각 실험이 한 재배 사이클(수 주) = 비싸다.
// "적은 실험으로 최적점을 찾는" 베이지안 최적화가 정석. 가우시안 프로세스로 미탐색
// 영역의 불확실성을 추정하고, 획득함수(UCB)로 "유망하거나 불확실한 곳"을 다음
// 실험점으로 제안한다. 밴딧(이산 팔)의 연속·표본효율 상위호환.
export interface RecipePoint {
  light: number; // 정규화 0~1 (PPFD)
  temp: number; // 0~1
  ec: number; // 0~1
  yield?: number; // 관측 수율 (있으면 학습 데이터)
}

export interface BayesOptResult {
  observed: number;
  bestSoFar: RecipePoint | null;
  bestYield: number;
  nextSuggestion: RecipePoint; // 다음 실험 제안
  nextAcquisition: number;
  note: string;
}

// RBF 커널 GP (경량 구현). 관측점으로 사후평균·분산 추정 → UCB로 다음점 제안.
export function bayesianRecipe(opts: {
  observations: RecipePoint[]; // 지금까지 실험한 레시피+수율
  kappa?: number; // 탐색 강도 (UCB)
  gridPerDim?: number;
  lengthScale?: number;
}): BayesOptResult {
  const obs = opts.observations.filter((o) => o.yield != null);
  const kappa = opts.kappa ?? 1.0; // 탐색/활용 균형 (2.0은 코너로 과탐색)
  const g = opts.gridPerDim ?? 6;
  const ls = opts.lengthScale ?? 0.3;
  const vec = (p: RecipePoint) => [p.light, p.temp, p.ec];
  const kernel = (a: number[], b: number[]) =>
    Math.exp(-a.reduce((s, ai, i) => s + (ai - b[i]) ** 2, 0) / (2 * ls * ls));

  const best =
    obs.length > 0 ? obs.reduce((a, b) => (b.yield! > a.yield! ? b : a)) : null;
  const bestYield = best?.yield ?? 0;
  const meanY = obs.length ? obs.reduce((s, o) => s + o.yield!, 0) / obs.length : 0;

  // GP 사후: 관측 없으면 사전(평균 0, 분산 1) → 전역 탐색
  const posterior = (x: number[]) => {
    if (obs.length === 0) return { mu: meanY, sigma: 1 };
    // 단순 커널 회귀 사후평균 + 근접도 기반 분산 (경량)
    let wsum = 0;
    let vsum = 0;
    let maxk = 0;
    for (const o of obs) {
      const k = kernel(x, vec(o));
      wsum += k;
      vsum += k * (o.yield! - meanY);
      maxk = Math.max(maxk, k);
    }
    const mu = meanY + (wsum > 0 ? vsum / wsum : 0);
    const sigma = Math.sqrt(Math.max(0, 1 - maxk)); // 가까운 관측 있으면 불확실성↓
    return { mu, sigma };
  };

  // 그리드 탐색으로 UCB = mu + kappa·sigma 최대점 = 다음 실험 제안
  let nextX = [0.5, 0.5, 0.5];
  let bestAcq = -Infinity;
  for (let a = 0; a < g; a++)
    for (let b = 0; b < g; b++)
      for (let c = 0; c < g; c++) {
        const x = [a / (g - 1), b / (g - 1), c / (g - 1)];
        const { mu, sigma } = posterior(x);
        const acq = mu + kappa * sigma;
        if (acq > bestAcq) {
          bestAcq = acq;
          nextX = x;
        }
      }

  return {
    observed: obs.length,
    bestSoFar: best,
    bestYield: Math.round(bestYield * 100) / 100,
    nextSuggestion: {
      light: Math.round(nextX[0] * 100) / 100,
      temp: Math.round(nextX[1] * 100) / 100,
      ec: Math.round(nextX[2] * 100) / 100,
    },
    nextAcquisition: Math.round(bestAcq * 100) / 100,
    note: `관측 ${obs.length}회 → 다음 실험 제안: 광량 ${Math.round(
      nextX[0] * 100
    )}%·온도 ${Math.round(nextX[1] * 100)}%·EC ${Math.round(
      nextX[2] * 100
    )}% (획득값 ${Math.round(bestAcq * 100) / 100}). 재배 사이클마다 실험이 비싸 표본효율 최우선.`,
  };
}

// ── 프론티어 4: 베이불 생존분석 — 예지보전을 잔여수명(RUL)으로 ──────────────
// CUSUM은 "드리프트 있음"만 준다. 신뢰성공학의 베이불 분포로 열화 신호를
// 잔여유효수명(RUL)으로 환산한다 — "12일 뒤 고장 예상, 지금 방문 계획". 의료의
// 생존분석·기계 신뢰성의 표준. 열화 지표(예: 누적 CUSUM)를 위험률로 매핑.
export interface RulResult {
  hazardLevel: number; // 현재 위험률 0~1
  estimatedRulDays: number; // 잔여수명 추정(일)
  weibullShape: number; // β (>1이면 마모 고장 = 시간 갈수록 위험↑)
  action: "normal" | "schedule" | "urgent";
  note: string;
}

export function remainingUsefulLife(opts: {
  degradationIndex: number; // 0~1 (예: CUSUM 통계량 정규화)
  shape?: number; // 베이불 β (마모 고장 ~2.5)
  characteristicLifeDays?: number; // η (특성수명)
}): RulResult {
  const beta = opts.shape ?? 2.5; // >1: 마모형(시간 갈수록 고장률↑)
  const eta = opts.characteristicLifeDays ?? 120; // 건강→고장 총 유효수명
  const deg = Math.min(0.99, Math.max(0, opts.degradationIndex));

  // 열화지표 = 소모된 유효수명 비율. 현재 유효연령 t = deg × η.
  const tNow = deg * eta;
  // 잔여수명: 남은 유효수명을 베이불 마모가속으로 보정 — β>1이면 후반부일수록
  // 실제 잔여가 선형보다 짧다. RUL = η(1-deg) × (1-deg)^(β-1).
  const rul = Math.max(0, eta * (1 - deg) * Math.pow(1 - deg, beta - 1));
  // 위험률 h(t) = (β/η)(t/η)^(β-1), 정규화(0~1)
  const hazard = Math.min(1, (beta / eta) * Math.pow(tNow / eta, beta - 1) * eta / beta);

  const action = rul < 7 ? "urgent" : rul < 21 ? "schedule" : "normal";
  return {
    hazardLevel: Math.round(hazard * 100) / 100,
    estimatedRulDays: Math.round(rul),
    weibullShape: beta,
    action,
    note:
      action === "urgent"
        ? `잔여수명 ~${Math.round(rul)}일 — 긴급 방문(다음 순회 못 기다림)`
        : action === "schedule"
          ? `잔여수명 ~${Math.round(rul)}일 — 다음 정기 순회에 교체 포함`
          : `잔여수명 ~${Math.round(rul)}일 — 정상, 감시 지속`,
  };
}
