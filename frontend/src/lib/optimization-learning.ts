// ── 학습·통계 계층 격상 ─────────────────────────────────────────────────────
//   ① 문맥 밴딧(LinUCB) — 기존 밴딧은 팔(품종)만 보고 사이트를 보지 않아 모든 사이트에
//      같은 답을 준다. 층고·상권·계절을 문맥으로 넣으면 사이트마다 다른 추천이 나온다.
//   ② 다변량 관리도(MEWMA) — 센서별 독립 CUSUM은 센서 간 관계가 무너지는 복합 열화를
//      못 잡는다(히터는 버티는데 순환팬이 죽어 온습도 관계가 어긋나는 경우).
//   ③ 컨포멀 예측 구간 — 점추정만 넘기면 받는 쪽이 얼마나 믿을지 판단할 수 없다.
//      분포 가정 없이 잔차만으로 보증된 커버리지의 구간을 만든다.

import type { IoTReading } from "./iot-health";
import { mulberry32, gaussFrom } from "./prng";

// ── 작은 선형대수 (차원이 3~5라 전용 구현으로 충분) ────────────────────────

function identity(d: number): number[][] {
  return Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => (i === j ? 1 : 0))
  );
}

// 가우스-조던 역행렬. 특이행렬이면 null — 호출부가 판정 보류로 처리한다.
function invert(m: number[][]): number[][] | null {
  const d = m.length;
  const a = m.map((row, i) => [...row, ...identity(d)[i]]);
  for (let col = 0; col < d; col++) {
    let pivot = col;
    for (let r = col + 1; r < d; r++)
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col];
    for (let j = 0; j < 2 * d; j++) a[col][j] /= p;
    for (let r = 0; r < d; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * d; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(d));
}

function matVec(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

// ── ① LinUCB 문맥 밴딧 ─────────────────────────────────────────────────────
// 각 팔마다 선형 보상모델 r ≈ θᵀx 를 두고, 능형회귀 사후에서 신뢰상한
// θ̂ᵀx + α√(xᵀA⁻¹x) 이 가장 큰 팔을 고른다. 두 번째 항이 "이 문맥에서 아직 덜 써본
// 팔"에 가산점을 주어 탐색을 만든다.

export interface LinUcbState {
  /** 팔별 A = I + Σ xxᵀ */
  A: number[][][];
  /** 팔별 b = Σ r·x */
  b: number[][];
  /** 팔별 관측 횟수 */
  n: number[];
  dim: number;
}

export function initLinUcb(numArms: number, dim: number): LinUcbState {
  return {
    A: Array.from({ length: numArms }, () => identity(dim)),
    b: Array.from({ length: numArms }, () => Array(dim).fill(0)),
    n: Array(numArms).fill(0),
    dim,
  };
}

// 주의: 탐색 항 α√(xᵀA⁻¹x)는 O(α) 크기다. 보상이 원 단위(10⁴)로 들어오면 학습된
// 평균 항이 탐색 항을 압도해, 처음 고른 팔이 영원히 이긴다. 보상을 대략 1 규모로
// 정규화해 넘기거나 α를 보상 규모에 맞춰 키워야 한다 —
// contextualCropAllocation은 정규화를 대신 해준다.
export function linUcbSelect(
  state: LinUcbState,
  context: number[],
  alpha = 1.0
): { arm: number; scores: number[] } {
  const scores = state.A.map((A, i) => {
    const Ainv = invert(A);
    if (!Ainv) return -Infinity;
    const theta = matVec(Ainv, state.b[i]);
    const mean = dot(theta, context);
    const width = Math.sqrt(Math.max(0, dot(context, matVec(Ainv, context))));
    return mean + alpha * width;
  });
  let arm = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[arm]) arm = i;
  return { arm, scores };
}

// 불변 갱신 — 관측 한 건을 반영한 새 상태를 돌려준다.
export function linUcbUpdate(
  state: LinUcbState,
  arm: number,
  context: number[],
  reward: number
): LinUcbState {
  const A = state.A.map((m, i) =>
    i === arm ? m.map((row, r) => row.map((v, c) => v + context[r] * context[c])) : m
  );
  const b = state.b.map((v, i) =>
    i === arm ? v.map((x, j) => x + reward * context[j]) : v
  );
  const n = [...state.n];
  n[arm] += 1;
  return { A, b, n, dim: state.dim };
}

export interface SiteContext {
  siteId: string;
  /** 정규화 특성 (0~1): 층고 여유 · 상권 프리미엄 수요 · 계절 */
  features: number[];
  featureLabels?: string[];
}

export interface ContextualAllocation {
  assignments: { siteId: string; arm: string; score: number }[];
  armShares: { name: string; share: number }[];
  /** 무작위(균등) 배정 대비 기대마진 개선 — 학습이 실제로 한 일 */
  upliftVsUniform: number;
  /**
   * 정답을 미리 아는 단일 배분 대비 격차. 학습 전에는 알 수 없는 값이라 실전 비교
   * 대상이 아니라 상한(오라클)이다. 음수면 "탐색 비용이 아직 회수되지 않았다"는 뜻.
   */
  gapToOracleFixed: number;
  distinctRecommendations: number;
  synthetic: boolean;
  note: string;
}

// 사이트별 문맥에 맞춘 품목 배분. 시뮬레이션에서 보상은 문맥과 팔의 상호작용으로
// 생성한다 — 실운영에서는 이 자리에 실측 마진이 들어오고 알고리즘은 그대로다.
export function contextualCropAllocation(opts: {
  sites: SiteContext[];
  arms: { name: string; /** 팔별 문맥 가중 — 실운영에선 미지, 학습 대상 */ weights: number[]; base: number }[];
  alpha?: number;
  seed?: number;
  noiseStd?: number;
}): ContextualAllocation {
  const rand = mulberry32(opts.seed ?? 17);
  const gauss = gaussFrom(rand);
  const noise = opts.noiseStd ?? 800;
  const dim = opts.sites[0]?.features.length ?? 0;
  if (dim === 0 || opts.arms.length === 0) {
    return {
      assignments: [],
      armShares: [],
      upliftVsUniform: 0,
      gapToOracleFixed: 0,
      distinctRecommendations: 0,
      synthetic: true,
      note: "문맥 또는 팔이 비어 있음",
    };
  }

  const trueReward = (armIdx: number, x: number[]) =>
    opts.arms[armIdx].base + dot(opts.arms[armIdx].weights, x);

  // 보상을 1 규모로 정규화한다. 원 단위 그대로 학습시키면 평균 항이 탐색 항을 압도해
  // 첫 팔에 고착된다(모든 사이트에 같은 답 → 문맥 밴딧을 쓰는 의미가 사라진다).
  const scale =
    opts.arms.reduce((s, a) => s + Math.abs(a.base), 0) / Math.max(1, opts.arms.length) || 1;

  let state = initLinUcb(opts.arms.length, dim);
  const assignments: { siteId: string; arm: string; score: number }[] = [];
  let contextualTotal = 0;

  opts.sites.forEach((site, i) => {
    // 워밍업: 팔마다 최소 한 번은 써 본다. 안 그러면 학습 전 사후가 모두 같아
    // 인덱스가 낮은 팔만 뽑히고, 나머지 팔은 영영 관측되지 않는다.
    const { arm, scores } =
      i < opts.arms.length
        ? { arm: i, scores: Array(opts.arms.length).fill(0) }
        : linUcbSelect(state, site.features, opts.alpha ?? 1.0);
    const reward = trueReward(arm, site.features) + gauss() * noise;
    state = linUcbUpdate(state, arm, site.features, reward / scale);
    assignments.push({
      siteId: site.siteId,
      arm: opts.arms[arm].name,
      score: Math.round(scores[arm] * scale),
    });
    contextualTotal += trueReward(arm, site.features);
  });

  // 실전 비교 기준은 "무작위로 골고루 배정"이다. 어느 팔이 최선인지 모르는 상태에서
  // 시작하므로, 정답을 아는 고정 배분과 견주는 건 공정하지 않다(그건 상한일 뿐).
  const uniformExpected =
    opts.sites.reduce(
      (s, site) =>
        s + opts.arms.reduce((t, _, i) => t + trueReward(i, site.features), 0) / opts.arms.length,
      0
    );
  const oracleFixedBest = Math.max(
    ...opts.arms.map((_, i) =>
      opts.sites.reduce((s, site) => s + trueReward(i, site.features), 0)
    )
  );

  const counts = new Map<string, number>();
  for (const a of assignments) counts.set(a.arm, (counts.get(a.arm) ?? 0) + 1);

  return {
    assignments,
    armShares: opts.arms.map((a) => ({
      name: a.name,
      share: Math.round(((counts.get(a.name) ?? 0) / opts.sites.length) * 100) / 100,
    })),
    upliftVsUniform: Math.round(contextualTotal - uniformExpected),
    gapToOracleFixed: Math.round(contextualTotal - oracleFixedBest),
    distinctRecommendations: counts.size,
    synthetic: true,
    note: `사이트 ${opts.sites.length}곳에 ${counts.size}가지 배분 — 문맥(층고·상권·계절)에 따라 답이 갈린다. 무작위 배정 대비 기대마진 ${
      contextualTotal - uniformExpected >= 0 ? "+" : ""
    }${Math.round(contextualTotal - uniformExpected)}원. ${
      contextualTotal - oracleFixedBest >= 0
        ? "정답을 미리 아는 단일 배분도 넘어섰다."
        : `정답을 아는 단일 배분에는 ${Math.round(
            oracleFixedBest - contextualTotal
          )}원 못 미친다 — 사이트가 ${opts.sites.length}곳뿐이라 탐색 비용을 아직 회수하지 못했다. 다지점이 늘수록 좁혀진다.`
    } 보상은 가정한 문맥 가중으로 생성한 시뮬레이션이며, 실측 마진이 쌓이면 같은 알고리즘이 그대로 돈다.`,
  };
}

// ── ② 다변량 관리도 (MEWMA) ────────────────────────────────────────────────
// 센서별 CUSUM은 각 축을 따로 본다. 온도도 습도도 각각은 정상범위인데 둘의 관계가
// 평소와 다른 상황(제습 실패, 순환 정지)은 단변량으로 안 잡힌다. 공분산의 역행렬로
// 거리를 재면 그 관계 붕괴가 잡힌다.
//
// 계절성은 단변량과 같은 방식으로 24시간 차분해 제거하고, 공분산이 특이하면
// (센서가 상수이거나 완전 공선) 판정을 보류한다 — 억지로 정칙화하면 없는 신호가 생긴다.

export const MULTIVARIATE_SENSORS: (keyof IoTReading)[] = [
  "temperature",
  "humidity",
  "co2Level",
  "phLevel",
];

export interface MultivariateDriftResult {
  status: "ok" | "insufficient-data" | "degenerate-covariance";
  detected: boolean;
  detectedIndex: number | null;
  maxStatistic: number;
  threshold: number;
  /** 탐지 시점에 가장 크게 기여한 센서 */
  topContributor: string | null;
  /** 실제로 판정에 쓴 센서 */
  sensors: string[];
  /** 양자화로 산포 추정이 성립하지 않아 축에서 뺀 센서 */
  droppedSensors: string[];
  note: string;
}

// 축 하나가 굵게 양자화돼 있으면(예: 0.17 단위로만 보고하는 pH) 그 축의 기준 분산이
// 양자화 잡음 수준으로 작아져, 조금만 움직여도 마할라노비스 거리가 폭발한다.
// 단변량 관리도에서 판정을 보류하는 것과 같은 이유로, 그런 축은 빼고 나머지로 본다.
// 축을 빼는 편이 전체를 포기하는 것보다 낫다 — 남은 센서 간 관계는 여전히 볼 수 있다.
function isQuantizationDominated(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const absDev = values.map((v) => Math.abs(v - mid)).sort((a, b) => a - b);
  const scale = 1.4826 * absDev[Math.floor(absDev.length / 2)];
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0 && d < step) step = d;
  }
  return !(scale > 0) || (Number.isFinite(step) && scale < step);
}

export function multivariateDrift(
  readings: IoTReading[],
  opts?: { lag?: number; lambda?: number; threshold?: number; sensors?: (keyof IoTReading)[] }
): MultivariateDriftResult {
  const lag = opts?.lag ?? 24;
  const lambda = opts?.lambda ?? 0.2;
  const requested = opts?.sensors ?? MULTIVARIATE_SENSORS;
  const chiSquare999 = [0, 10.8, 13.8, 16.3, 18.5, 20.5];

  if (readings.length < lag + 24) {
    return {
      status: "insufficient-data",
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      threshold: chiSquare999[requested.length] ?? 18.5,
      topContributor: null,
      sensors: requested as string[],
      droppedSensors: [],
      note: `데이터 부족 — 판정 보류 (최소 ${lag + 24}건 필요)`,
    };
  }

  // 계절 차분 후, 양자화가 지배하는 축을 먼저 걸러낸다.
  const diffByRequested = requested.map((k) => {
    const col: number[] = [];
    for (let i = lag; i < readings.length; i++) col.push(readings[i][k] - readings[i - lag][k]);
    return col;
  });
  const keep = requested.filter((_, j) => !isQuantizationDominated(diffByRequested[j]));
  const dropped = requested.filter((_, j) => isQuantizationDominated(diffByRequested[j]));
  const sensors = keep;
  const d = sensors.length;
  // 자유도 d의 χ² 상위 0.1% 근사값 — 관리도 관행대로 오경보를 낮게 잡는다.
  const threshold = opts?.threshold ?? chiSquare999[d] ?? 18.5;

  if (d < 2) {
    return {
      status: "degenerate-covariance",
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      threshold,
      topContributor: null,
      sensors: sensors as string[],
      droppedSensors: dropped as string[],
      note: `산포 추정이 성립하는 센서가 ${d}개뿐 — 다변량 판정 보류 (제외: ${dropped.join(", ")})`,
    };
  }

  const diffs: number[][] = [];
  for (let i = lag; i < readings.length; i++) {
    diffs.push(sensors.map((k) => readings[i][k] - readings[i - lag][k]));
  }

  // 기준 구간(앞 1/3)에서 평균·공분산 추정
  const baseN = Math.max(24, Math.floor(diffs.length / 3));
  const base = diffs.slice(0, baseN);
  const mean = Array.from(
    { length: d },
    (_, j) => base.reduce((s, row) => s + row[j], 0) / base.length
  );
  const cov = Array.from({ length: d }, (_, a) =>
    Array.from({ length: d }, (_, b) =>
      base.reduce((s, row) => s + (row[a] - mean[a]) * (row[b] - mean[b]), 0) /
      Math.max(1, base.length - 1)
    )
  );
  // 상수 센서(대각이 0)가 있으면 공분산이 특이하다 — 단변량 축퇴 가드와 같은 취지.
  if (cov.some((row, i) => !(row[i] > 0))) {
    return {
      status: "degenerate-covariance",
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      threshold,
      topContributor: null,
      sensors: sensors as string[],
      droppedSensors: dropped as string[],
      note: "센서 중 산포가 없는 축이 있어 공분산이 특이 — 다변량 판정 보류",
    };
  }
  const covInv = invert(cov);
  if (!covInv) {
    return {
      status: "degenerate-covariance",
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      threshold,
      topContributor: null,
      sensors: sensors as string[],
      droppedSensors: dropped as string[],
      note: "센서 간 완전 공선으로 공분산 역행렬이 존재하지 않음 — 다변량 판정 보류",
    };
  }

  // MEWMA: z_t = λ(x_t − μ) + (1−λ)z_{t−1}, 통계량 = z' Σz⁻¹ z
  // Σz = (λ/(2−λ))·Σ (정상상태 근사)
  const scale = lambda / (2 - lambda);
  let z = Array(d).fill(0);
  let maxStat = 0;
  let detectedIndex: number | null = null;
  let topContributor: string | null = null;

  for (let i = baseN; i < diffs.length; i++) {
    const x = diffs[i];
    z = z.map((zi, j) => lambda * (x[j] - mean[j]) + (1 - lambda) * zi);
    const stat = dot(z, matVec(covInv, z)) / scale;
    if (stat > maxStat) {
      maxStat = stat;
      // 기여도: 각 축을 평균으로 되돌렸을 때 통계량이 얼마나 줄어드는지
      let bestDrop = -Infinity;
      for (let j = 0; j < d; j++) {
        const zj = [...z];
        zj[j] = 0;
        const drop = stat - dot(zj, matVec(covInv, zj)) / scale;
        if (drop > bestDrop) {
          bestDrop = drop;
          topContributor = sensors[j] as string;
        }
      }
    }
    if (stat > threshold && detectedIndex === null) detectedIndex = i + lag;
  }

  return {
    status: "ok",
    detected: detectedIndex !== null,
    detectedIndex,
    maxStatistic: Math.round(maxStat * 10) / 10,
    threshold,
    topContributor,
    sensors: sensors as string[],
    droppedSensors: dropped as string[],
    note:
      (dropped.length > 0 ? `${dropped.join(", ")} 축은 양자화로 제외. ` : "") +
      (detectedIndex !== null
        ? `센서 간 관계 이탈 감지 (통계량 ${Math.round(maxStat * 10) / 10} > ${threshold}, 최대 기여 ${topContributor}). 각 센서는 정상범위여도 평소의 관계가 깨진 상태 — 단변량 관리도가 놓치는 복합 열화다.`
        : `센서 간 관계 안정 (최대 ${Math.round(maxStat * 10) / 10} ≤ ${threshold})`),
  };
}

// ── ③ 컨포멀 예측 구간 ─────────────────────────────────────────────────────
// 분할 컨포멀: 보정용 잔차의 |오차| 분위수를 그대로 폭으로 쓴다. 분포 가정이 없고,
// 표본이 교환가능하기만 하면 목표 커버리지가 유한표본에서 보증된다.
// 예측이 틀릴 수 있다는 사실을 숫자로 넘겨야 파종·방문 계획이 그 폭을 반영할 수 있다.

export interface ConformalInterval {
  /** 목표 커버리지 (예: 0.9) */
  targetCoverage: number;
  /** 실제 달성 커버리지 — 표본이 적으면 목표보다 보수적으로 나온다 */
  achievedCoverage: number;
  halfWidth: number;
  calibrationSamples: number;
  valid: boolean;
  note: string;
}

export function conformalHalfWidth(
  residuals: number[],
  targetCoverage = 0.9
): ConformalInterval {
  const abs = residuals
    .filter((r) => Number.isFinite(r))
    .map((r) => Math.abs(r))
    .sort((a, b) => a - b);
  const n = abs.length;
  // 유한표본 보증에 필요한 최소 표본: ceil((n+1)(1−α)) ≤ n 을 만족해야 한다.
  const minN = Math.ceil(1 / (1 - targetCoverage)) - 1;
  if (n < Math.max(5, minN)) {
    return {
      targetCoverage,
      achievedCoverage: 0,
      halfWidth: 0,
      calibrationSamples: n,
      valid: false,
      note: `보정 표본 ${n}건 — ${targetCoverage * 100}% 구간을 보증하려면 최소 ${Math.max(5, minN)}건 필요. 구간 없이 점추정만 넘긴다`,
    };
  }
  const rank = Math.min(n, Math.ceil((n + 1) * targetCoverage));
  const halfWidth = abs[rank - 1];
  return {
    targetCoverage,
    achievedCoverage: Math.round((rank / (n + 1)) * 100) / 100,
    halfWidth: Math.round(halfWidth * 10) / 10,
    calibrationSamples: n,
    valid: true,
    note: `보정 표본 ${n}건에서 ±${Math.round(halfWidth * 10) / 10} 구간 — 분포 가정 없이 ${Math.round(
      (rank / (n + 1)) * 100
    )}% 커버리지 보증`,
  };
}

export interface IntervalForecast {
  point: number[];
  lower: number[];
  upper: number[];
  interval: ConformalInterval;
}

// 점예측 계열에 컨포멀 폭을 씌운다. 예측 지평이 멀수록 불확실성이 커지므로
// √h로 폭을 넓힌다(누적오차의 통상적 스케일링).
export function withConformalInterval(
  point: number[],
  residuals: number[],
  targetCoverage = 0.9
): IntervalForecast {
  const interval = conformalHalfWidth(residuals, targetCoverage);
  if (!interval.valid) {
    return { point, lower: [...point], upper: [...point], interval };
  }
  const lower = point.map((v, h) =>
    Math.max(0, Math.round(v - interval.halfWidth * Math.sqrt(h + 1)))
  );
  const upper = point.map((v, h) =>
    Math.round(v + interval.halfWidth * Math.sqrt(h + 1))
  );
  return { point, lower, upper, interval };
}

// 학습 구간에서 한 발 앞 예측 잔차를 뽑는다 — 컨포멀 보정과 뉴스벤더 분위수의 입력.
export function oneStepResiduals(
  series: number[],
  forecaster: (history: number[]) => number,
  minHistory = 14
): number[] {
  const res: number[] = [];
  for (let i = minHistory; i < series.length; i++) {
    const pred = forecaster(series.slice(0, i));
    if (Number.isFinite(pred)) res.push(series[i] - pred);
  }
  return res;
}
