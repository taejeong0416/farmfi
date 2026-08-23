// ── 실시간 생육 모니터링 분석 합성 ────────────────────────────────────────
// 화면(웹 대시보드·모바일 앱)이 한 번의 호출로 "시계열 + 이상신호 + 생장"을 얻도록
// 탐지기들을 하나로 합성한다. 잡는 실패 모드가 서로 달라 상호보완이다:
//   ① detectAnomalies  — 윈도우 평균 대비 Z>3σ 스파이크(단발 이상치, 상대판정)
//   ② cusumDrift       — 일중앙값 MAD-CUSUM 관리도(지속 드리프트, "언제부터")
//   ③ 고장 게이트       — crop-profiles 파생 절대범위 위반(설비가 죽었나)
//   ④ 최적대 이탈       — 농학 최적 밴드 이탈(작물에 불리하나) — ③보다 좁고 가볍다
//   ⑤ DLI 판정         — 일적산광량 목표 달성률(광량은 순간값으로 못 잡는다)
//   ⑥ GDD 수확 예측     — 적산온도 기반 현 사이클 진행률·수확 예정일
//
// 광량을 순간값 게이트에서 뺀 것이 이 계층의 핵심 결정이다. 최적화(optimization.ts
// dliSchedule)는 요금이 싼 시간대로 광주기를 통째로 옮기고, 시간을 압축할 때 PPFD를
// 올린다. 그러면 "심야 점등"과 "평소보다 높은 순간 조도"가 둘 다 정상 운영이 되므로
// 순간값 판정은 오탐을 낸다. 반대로 LED가 서서히 열화해 조도가 28% 빠지는 진짜 고장은
// 어떤 절대 상한에도 안 걸린다. 광량은 일적산(DLI)으로만 정직하게 판정된다.
//
// 순수 함수 — DB/네트워크 의존 없음. API 라우트와 모바일 앱이 공유한다.

import {
  IoTReading,
  HEALTHY_RANGES,
  detectAnomalies,
  isHealthy,
} from "./iot-health";
import { cusumDrift } from "./optimization";
import { getCrop, faultRanges, luxToDli } from "./crop-profiles";
import { deriveRanges, type AppliedDecision } from "./applied-setpoints";

export type SensorKey = keyof IoTReading;

export interface MonitoringPoint {
  t: string; // recordedAt ISO
  ts: number; // epoch ms — 차트 X축(시간 비례 간격)
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  growthRate: number; // 현 사이클 진행률 %
  anomalyScore: number; // 이 시점 센서들 중 최대 Z (σ)
  isAnomaly: boolean; // Z>3σ 스파이크 발생
  affectedSensors: SensorKey[]; // 스파이크가 뜬 센서
  outOfRange: SensorKey[]; // 고장 게이트 이탈 — 심각
  outOfOptimal: SensorKey[]; // 농학 최적대 이탈 — 주의 (광량 제외)
  healthy: boolean; // 고장 게이트 전부 통과
}

export interface DriftAlert {
  sensor: SensorKey;
  detected: boolean;
  detectedAt: string | null; // 드리프트 시작 추정 시각
  detectedIndex: number | null; // points 배열상 인덱스
  maxStatistic: number; // CUSUM 통계량 최대치 (σ)
}

export interface DailyMetric {
  day: string; // 생육일 라벨 (해당 버킷 시작 시각 ISO)
  ts: number;
  dli: number; // mol/m²/day
  dliRatio: number; // 목표 대비 0~
  gdd: number; // ℃·day
  avgTemp: number;
  litHours: number;
  growthRate: number; // 그날 마지막 관측 진행률
  complete: boolean; // 24h를 온전히 담은 버킷인가 (양끝은 잘린다)
}

export interface LightAssessment {
  dliTarget: number;
  recentDli: number; // 최근 완전한 생육일 평균 DLI
  ratioPct: number; // 목표 대비 %
  status: "ok" | "under" | "over" | "unknown";
  trendPerDay: number; // 일별 DLI 회귀 기울기 (mol/day per day)
  degrading: boolean; // 유의미한 감소 추세 — LED 열화 의심
  message: string;
}

export interface HarvestForecast {
  cropLabel: string;
  cycleStartAt: string | null;
  cycleElapsedDays: number;
  accumulatedGdd: number;
  targetGdd: number;
  gddProgressPct: number;
  observedGrowthPct: number; // 센서 기록 진행률
  effectiveGddPerDay: number; // 광 제약 반영 유효 적산 속도
  daysRemaining: number | null;
  expectedHarvestAt: string | null;
  delayDays: number | null; // 표준 사이클 대비 지연(+) / 단축(−)
  message: string;
}

export interface MonitoringSummary {
  count: number;
  uptimeRate: number; // 고장 게이트 기준 가동률 %
  anomalyCount: number; // Z>3σ 스파이크 건수
  driftSensors: SensorKey[]; // CUSUM 드리프트 탐지된 센서
  suboptimalCount: number; // 최적대를 벗어난 판독 수
  latestHealthy: boolean; // 최신 판독이 고장 게이트 내
  windowStart: string | null;
  windowEnd: string | null;
}

export interface GrowthMonitoringResult {
  cropKey: string;
  points: MonitoringPoint[];
  drift: DriftAlert[];
  daily: DailyMetric[];
  light: LightAssessment;
  harvest: HarvestForecast;
  healthyRanges: Record<SensorKey, [number, number]>; // 고장 게이트
  optimalRanges: Record<SensorKey, [number, number]>; // 농학 최적대
  summary: MonitoringSummary;
}

export const SENSOR_META: Record<
  SensorKey,
  { label: string; unit: string; color: string }
> = {
  temperature: { label: "온도", unit: "°C", color: "#e05a3a" },
  humidity: { label: "습도", unit: "%", color: "#2f8fd6" },
  co2Level: { label: "CO₂", unit: "ppm", color: "#7a6cd6" },
  lightIntensity: { label: "광량", unit: "lux", color: "#d6a12f" },
  phLevel: { label: "양액 pH", unit: "pH", color: "#0b7d46" },
};

const SENSOR_KEYS: SensorKey[] = [
  "temperature",
  "humidity",
  "co2Level",
  "lightIntensity",
  "phLevel",
];

// 최적대 판정에서 광량은 뺀다 — 순간 조도는 스케줄에 따라 정상적으로 크게 움직인다.
const OPTIMAL_JUDGED: SensorKey[] = [
  "temperature",
  "humidity",
  "co2Level",
  "phLevel",
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// 가동률 = 윈도우 내 고장 게이트 통과 판독 비율(%).
function uptimeRate(readings: IoTReading[], cropKey?: string): number {
  if (readings.length === 0) return 0;
  return (
    (readings.filter((r) => isHealthy(r, cropKey)).length / readings.length) *
    100
  );
}

// ── 생육일 경계 ──────────────────────────────────────────────────────────────
// 자정으로 하루를 자르면 안 된다. TOU 최적화가 광주기를 심야로 옮기면(예: 22시 점등)
// 점등 블록이 자정에서 두 동강 나 일적산 DLI가 실제와 무관하게 진동한다.
// 경계는 "가장 어두운 시각" — 암기 한가운데에 둔다. 스케줄이 어디로 옮겨가든
// 점등 블록을 통째로 담는 버킷이 나온다.
function darkestHour(points: MonitoringPoint[]): number {
  const sum = new Array(24).fill(0);
  const cnt = new Array(24).fill(0);
  for (const p of points) {
    const h = new Date(p.ts).getHours();
    sum[h] += p.lightIntensity;
    cnt[h] += 1;
  }
  let best = 0;
  let bestAvg = Infinity;
  for (let h = 0; h < 24; h++) {
    if (cnt[h] === 0) continue;
    const avg = sum[h] / cnt[h];
    if (avg < bestAvg) {
      bestAvg = avg;
      best = h;
    }
  }
  return best;
}

// 판독 간격 — 적산 가중치이자 CUSUM 계절차분의 lag 산출 근거.
// 중앙값으로 잡아 결측·중복에 흔들리지 않게 한다.
function medianStepMs(points: MonitoringPoint[]): number {
  if (points.length < 2) return 30 * 60 * 1000;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) gaps.push(points[i].ts - points[i - 1].ts);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || 30 * 60 * 1000;
}

// ── CUSUM 입력: 일중앙값 집계 ───────────────────────────────────────────────
// 30분 표본을 그대로 관리도에 넣으면 안 된다. 설비 열화는 시간~일 단위로 움직이는데
// 60일치 2,880점을 훑으면 잡음의 무작위 여행만으로 관리한계를 넘어간다.
// 일주기를 없애려 24시간 차분을 거는 것도 답이 아니다 — 차분은 저주파 흔들림을
// lag 길이의 동일부호 런으로 바꾸고(acf(lag) ≈ −0.5), 관리도는 정확히 그 런에
// 반응한다. 하루를 통째로 집계하면 일주기 성분이 사라져 차분 자체가 필요 없다.
//
// 집계는 평균이 아니라 **중앙값**이다. 평균은 단발 스파이크에 오염된다 — 48개 중
// 한 표본의 +6℃가 일평균을 잡음 표준편차의 몇 배씩 밀어내고, 관리도는 그 하루를
// 드리프트 시작으로 읽는다. 스파이크는 Z-score가 담당하는 별개의 실패 모드이므로
// 드리프트 관리도에는 들어오지 않아야 한다. 중앙값은 그 오염을 통과시키지 않는다.
function dailyMedianReadings(
  buckets: { ts: number; points: MonitoringPoint[] }[]
): IoTReading[] {
  const median = (arr: MonitoringPoint[], k: SensorKey) => {
    const v = arr.map((p) => p[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return buckets.map(({ points: arr }) => ({
    temperature: median(arr, "temperature"),
    humidity: median(arr, "humidity"),
    co2Level: median(arr, "co2Level"),
    lightIntensity: median(arr, "lightIntensity"),
    phLevel: median(arr, "phLevel"),
  }));
}

/** 생육일 단위로 판독을 묶는다 — 일적산 지표와 관리도가 같은 경계를 쓰도록. */
function bucketByGrowthDay(
  points: MonitoringPoint[]
): { ts: number; points: MonitoringPoint[] }[] {
  if (points.length < 2) return [];
  const anchorHour = darkestHour(points);

  // 첫 점 이전의 가장 가까운 경계로 정렬한다.
  const anchor = new Date(points[0].ts);
  anchor.setHours(anchorHour, 0, 0, 0);
  let start = anchor.getTime();
  if (start > points[0].ts) start -= DAY_MS;

  const buckets = new Map<number, MonitoringPoint[]>();
  for (const p of points) {
    const key = start + Math.floor((p.ts - start) / DAY_MS) * DAY_MS;
    const arr = buckets.get(key);
    if (arr) arr.push(p);
    else buckets.set(key, [p]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, pts]) => ({ ts, points: pts }));
}

function buildDaily(
  buckets: { ts: number; points: MonitoringPoint[] }[],
  points: MonitoringPoint[],
  cropKey: string | undefined
): DailyMetric[] {
  if (buckets.length === 0) return [];
  const crop = getCrop(cropKey);
  const stepMs = medianStepMs(points);
  const stepH = stepMs / HOUR_MS;
  const expectedSteps = DAY_MS / stepMs;

  return buckets.map(({ ts, points: arr }) => {
    let dli = 0;
    let gddSum = 0;
    let litHours = 0;
    for (const p of arr) {
      dli += luxToDli(p.lightIntensity, stepH);
      gddSum += Math.max(0, p.temperature - crop.baseTempC) * stepH;
      if (p.lightIntensity > 100) litHours += stepH;
    }
    const avgTemp = arr.reduce((s, p) => s + p.temperature, 0) / arr.length;
    return {
      day: new Date(ts).toISOString(),
      ts,
      dli: Math.round(dli * 100) / 100,
      dliRatio: Math.round((dli / crop.dliTarget) * 1000) / 1000,
      gdd: Math.round((gddSum / 24) * 100) / 100,
      avgTemp: Math.round(avgTemp * 10) / 10,
      litHours: Math.round(litHours * 10) / 10,
      growthRate: arr[arr.length - 1].growthRate,
      // 양끝 버킷은 잘려 있어 일적산을 그대로 쓰면 미달로 오판한다.
      complete: arr.length >= expectedSteps * 0.9,
    };
  });
}

// 최소제곱 기울기 — DLI 추세(LED 열화)를 재는 데 쓴다.
function slope(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function assessLight(
  daily: DailyMetric[],
  cropKey: string | undefined,
  /** 적용된 설정점에서 온 목표 DLI. 없으면 문헌값. */
  dliTargetOverride?: number
): LightAssessment {
  const crop = getCrop(cropKey);
  const dliTarget = dliTargetOverride ?? crop.dliTarget;
  const usable = daily.filter((d) => d.complete);
  if (usable.length === 0) {
    return {
      dliTarget: dliTarget,
      recentDli: 0,
      ratioPct: 0,
      status: "unknown",
      trendPerDay: 0,
      degrading: false,
      message: "완전한 생육일이 없어 일적산광량을 판정할 수 없습니다.",
    };
  }
  const recent = usable.slice(-7);
  const recentDli = recent.reduce((s, d) => s + d.dli, 0) / recent.length;
  const ratioPct = Math.round((recentDli / dliTarget) * 1000) / 10;
  // 추세는 최근 2주만 본다. 창 전체로 회귀하면 오래된 정상 구간이 최근 열화를
  // 희석해, 조도가 눈에 띄게 빠지는 중인데도 기울기가 0 근처로 나온다.
  const trendWindow = usable.slice(-14);
  const trendPerDay =
    Math.round(slope(trendWindow.map((d) => d.dli)) * 1000) / 1000;
  // 하루 0.05 mol 이상 꾸준히 빠지면 사이클 안에 목표를 못 채운다 — 열화로 본다.
  const degrading = trendPerDay <= -0.05 && trendWindow.length >= 7;

  let status: LightAssessment["status"];
  let message: string;
  if (ratioPct < 90) {
    status = "under";
    message = `일적산광량이 목표의 ${ratioPct}%입니다. 광시간 또는 광량을 상향해야 수확이 밀리지 않습니다.`;
  } else if (ratioPct > 115) {
    status = "over";
    message = `일적산광량이 목표의 ${ratioPct}%입니다. 광포화 구간이라 초과분은 전기요금만 늘립니다 — 하향 여지가 있습니다.`;
  } else {
    status = "ok";
    message = `일적산광량이 목표의 ${ratioPct}%로 적정 구간입니다.`;
  }
  if (degrading) {
    message += ` 최근 추세가 하루 ${Math.abs(trendPerDay).toFixed(2)} mol씩 감소 중 — LED 광량 열화가 의심됩니다.`;
  }
  return {
    dliTarget: dliTarget,
    recentDli: Math.round(recentDli * 100) / 100,
    ratioPct,
    status,
    trendPerDay,
    degrading,
    message,
  };
}

function forecastHarvest(
  points: MonitoringPoint[],
  daily: DailyMetric[],
  light: LightAssessment,
  cropKey: string | undefined
): HarvestForecast {
  const crop = getCrop(cropKey);
  const empty: HarvestForecast = {
    cropLabel: crop.label,
    cycleStartAt: null,
    cycleElapsedDays: 0,
    accumulatedGdd: 0,
    targetGdd: crop.targetGdd,
    gddProgressPct: 0,
    observedGrowthPct: 0,
    effectiveGddPerDay: 0,
    daysRemaining: null,
    expectedHarvestAt: null,
    delayDays: null,
    message: "수확 예측에 필요한 관측이 부족합니다.",
  };
  if (points.length === 0 || daily.length === 0) return empty;

  // 현 사이클 시작 = 진행률이 크게 되돌아간 마지막 지점(수확 후 재정식).
  let cycleStartIdx = 0;
  for (let i = points.length - 1; i > 0; i--) {
    if (points[i].growthRate < points[i - 1].growthRate - 5) {
      cycleStartIdx = i;
      break;
    }
  }
  const cycleStartTs = points[cycleStartIdx].ts;
  const lastTs = points[points.length - 1].ts;
  const cycleElapsedDays =
    Math.round(((lastTs - cycleStartTs) / DAY_MS) * 10) / 10;

  const inCycle = daily.filter((d) => d.ts >= cycleStartTs - DAY_MS);
  // 적산은 광 제약을 반영한 **유효 GDD**로 쌓는다. 온도만으로 세면 광이 모자란 날도
  // 만근으로 잡혀 진행률이 실제 생장을 앞질러 버린다(목표를 채웠는데 작물은 덜 자란
  // 상태). 진행률과 수확 예측이 같은 척도 위에 있어야 한다.
  const dayFactor = (d: DailyMetric) => Math.min(1, Math.max(0.3, d.dliRatio));
  const accumulatedGdd =
    Math.round(inCycle.reduce((s, d) => s + d.gdd * dayFactor(d), 0) * 10) / 10;
  const observedGrowthPct = points[points.length - 1].growthRate;

  // 유효 적산 속도 = 최근 적산온도 × 광 제약. 광이 모자라면 온도가 충분해도
  // 생장이 그만큼 못 나간다 — 광포화 위쪽은 이득이 없으므로 1.0에서 자른다.
  const recentDays = inCycle.filter((d) => d.complete).slice(-7);
  const gddPerDay = recentDays.length
    ? recentDays.reduce((s, d) => s + d.gdd, 0) / recentDays.length
    : 0;
  const lightFactor =
    light.status === "unknown"
      ? 1
      : Math.min(1, Math.max(0.3, light.ratioPct / 100));
  const effectiveGddPerDay = Math.round(gddPerDay * lightFactor * 100) / 100;

  const gddProgressPct =
    Math.round((accumulatedGdd / crop.targetGdd) * 1000) / 10;

  if (effectiveGddPerDay <= 0) {
    return {
      ...empty,
      cycleStartAt: new Date(cycleStartTs).toISOString(),
      cycleElapsedDays,
      accumulatedGdd,
      gddProgressPct,
      observedGrowthPct,
      message: "적산온도가 쌓이지 않고 있습니다 — 온도 제어를 확인하세요.",
    };
  }

  const remainingGdd = Math.max(0, crop.targetGdd - accumulatedGdd);
  const daysRemaining = Math.round((remainingGdd / effectiveGddPerDay) * 10) / 10;
  const expectedHarvestAt = new Date(lastTs + daysRemaining * DAY_MS).toISOString();
  const delayDays =
    Math.round((cycleElapsedDays + daysRemaining - crop.cycleDays) * 10) / 10;

  let message: string;
  if (remainingGdd === 0) {
    message = `적산온도 목표를 채웠습니다 — 수확 가능 단계입니다.`;
  } else if (delayDays >= 1) {
    message = `표준 사이클(${crop.cycleDays}일) 대비 ${delayDays.toFixed(1)}일 지연 예상입니다.`;
    if (light.status === "under") message += " 광량 부족이 주요 원인입니다.";
  } else if (delayDays <= -1) {
    message = `표준 사이클 대비 ${Math.abs(delayDays).toFixed(1)}일 단축 예상입니다.`;
  } else {
    message = `표준 사이클(${crop.cycleDays}일) 일정대로 진행 중입니다.`;
  }

  return {
    cropLabel: crop.label,
    cycleStartAt: new Date(cycleStartTs).toISOString(),
    cycleElapsedDays,
    accumulatedGdd,
    targetGdd: crop.targetGdd,
    gddProgressPct,
    observedGrowthPct,
    effectiveGddPerDay,
    daysRemaining,
    expectedHarvestAt,
    delayDays,
    message,
  };
}

/**
 * 시계열 판독을 받아 시각화 가능한 이상탐지 + 생장 분석 결과로 합성한다.
 * @param readings  오름차순(과거→현재)으로 정렬된 판독
 * @param recordedAts  readings와 같은 순서·길이의 기록 시각
 * @param growthRates  같은 순서의 사이클 진행률(%). 없으면 0으로 둔다.
 * @param cropKey  작물 프로파일 키. 없으면 기본 작물.
 */
export function analyzeGrowthMonitoring(
  readings: IoTReading[],
  recordedAts: Array<string | Date>,
  growthRates?: number[],
  cropKey?: string,
  /**
   * 이 매장에 **적용된** 설정점(`SetpointApplication.decisions`).
   * 주면 최적대와 목표 DLI가 그 값을 중심으로 좁혀진다 — 학습 결과가 판정에
   * 반영되는 지점이다. 없으면 문헌값 그대로 간다(W1 이전과 같은 동작).
   * 고장 게이트는 어느 경우에도 바뀌지 않는다.
   */
  appliedSetpoints?: AppliedDecision[] | null
): GrowthMonitoringResult {
  const crop = getCrop(cropKey);
  const derived = deriveRanges(cropKey, appliedSetpoints);
  const optimalRanges = derived.optimal as Record<
    SensorKey,
    [number, number]
  >;
  const gateRanges = faultRanges(cropKey);
  const n = Math.min(readings.length, recordedAts.length);
  const iso = (v: string | Date) =>
    typeof v === "string" ? v : v.toISOString();

  if (n === 0) {
    const daily: DailyMetric[] = [];
    const light = assessLight(daily, cropKey, derived.dliTarget);
    return {
      cropKey: crop.key,
      points: [],
      drift: SENSOR_KEYS.filter((k) => k !== "lightIntensity").map((sensor) => ({
        sensor,
        detected: false,
        detectedAt: null,
        detectedIndex: null,
        maxStatistic: 0,
      })),
      daily,
      light,
      harvest: forecastHarvest([], daily, light, cropKey),
      healthyRanges: gateRanges,
      optimalRanges,
      summary: {
        count: 0,
        uptimeRate: 0,
        anomalyCount: 0,
        driftSensors: [],
        suboptimalCount: 0,
        latestHealthy: false,
        windowStart: null,
        windowEnd: null,
      },
    };
  }

  // ① 단발 이상치(Z-score) — readings와 1:1 정렬
  const anomalies = detectAnomalies(readings);

  const points: MonitoringPoint[] = readings.slice(0, n).map((r, i) => {
    const outOfRange = SENSOR_KEYS.filter((key) => {
      const [lo, hi] = gateRanges[key];
      return r[key] < lo || r[key] > hi;
    });
    const outOfOptimal = OPTIMAL_JUDGED.filter((key) => {
      const [lo, hi] = optimalRanges[key];
      return r[key] < lo || r[key] > hi;
    });
    const a = anomalies[i];
    return {
      t: iso(recordedAts[i]),
      ts: new Date(recordedAts[i]).getTime(),
      temperature: r.temperature,
      humidity: r.humidity,
      co2Level: r.co2Level,
      lightIntensity: r.lightIntensity,
      phLevel: r.phLevel,
      growthRate: growthRates?.[i] ?? 0,
      anomalyScore: Math.round(a.anomalyScore * 100) / 100,
      isAnomaly: a.isAnomaly,
      affectedSensors: a.affectedSensors as SensorKey[],
      outOfRange,
      outOfOptimal,
      healthy: outOfRange.length === 0,
    };
  });

  // ② 지속 드리프트(CUSUM) — 일중앙값 계열에 차분 없이 걸고 원본 시각으로 환산한다.
  // 관리한계는 창 길이에 맞춰 키운다 — 고정 H는 긴 창에서 반드시 울린다.
  // 양끝의 잘린 부분일은 뺀다. 반나절짜리 버킷의 중앙값은 그 시간대의 값일 뿐
  // 온전한 하루와 비교할 수 없고, 그대로 넣으면 창의 첫날·마지막날마다 드리프트가
  // 잡힌다(관측된 오경보가 전부 마지막 버킷에서 나왔다).
  const stepMs = medianStepMs(points);
  const allBuckets = bucketByGrowthDay(points);
  const buckets = allBuckets.filter(
    (b) => b.points.length >= (DAY_MS / stepMs) * 0.9
  );
  const cusum = cusumDrift(dailyMedianReadings(buckets), {
    lag: 0,
    calibrate: buckets.length >= 20,
  });
  const firstTs = points[0].ts;
  const drift: DriftAlert[] = cusum.map((c) => {
    const hitTs =
      c.detectedIndex != null && c.detectedIndex < buckets.length
        ? buckets[c.detectedIndex].ts
        : null;
    // 원본 시계열에서 그 시각에 해당하는 인덱스 — 차트가 세로선을 놓을 자리.
    const idx =
      hitTs == null
        ? null
        : Math.min(
            points.length - 1,
            Math.max(0, Math.round((hitTs - firstTs) / stepMs))
          );
    return {
      sensor: c.sensor as SensorKey,
      detected: c.detected,
      detectedIndex: idx,
      detectedAt: idx == null ? null : points[idx].t,
      maxStatistic: c.maxStatistic,
    };
  });

  // ⑤⑥ 일적산 지표 → 광량 판정 → 수확 예측
  const daily = buildDaily(allBuckets, points, cropKey);
  const light = assessLight(daily, cropKey, derived.dliTarget);
  const harvest = forecastHarvest(points, daily, light, cropKey);

  const summary: MonitoringSummary = {
    count: n,
    uptimeRate: Math.round(uptimeRate(readings.slice(0, n), cropKey) * 10) / 10,
    anomalyCount: points.filter((p) => p.isAnomaly).length,
    driftSensors: drift.filter((d) => d.detected).map((d) => d.sensor),
    suboptimalCount: points.filter((p) => p.outOfOptimal.length > 0).length,
    latestHealthy: points[points.length - 1].healthy,
    windowStart: points[0].t,
    windowEnd: points[points.length - 1].t,
  };

  return {
    cropKey: crop.key,
    points,
    drift,
    daily,
    light,
    harvest,
    healthyRanges: gateRanges,
    optimalRanges,
    summary,
  };
}

// 기존 소비자 호환 — 고장 게이트 상수를 그대로 재노출한다.
export { HEALTHY_RANGES };
