// ── AI 운영 최적화 엔진 ─────────────────────────────────────────────────────
// 검증(iot-health)과 같은 센서 데이터를 운영 최적화에 이중 활용한다.
// ① 전력비: 시간대별 요금(TOU) 연동 LED 광주기 스케줄링
// ② 관리비: 센서 드리프트 기반 예지보전(계획 방문 전환)
// ③ 자원: 수요 예측 연동 파종·양액 보정 권고
//
// 실내팜은 광주기를 통째로 옮길 수 있는 유일한 농업이므로, "몇 시에 켤 것인가"가
// 곧 전기 원가다. 요금표·전력량은 전부 주입 가능 — 농사용(을) 확정 시 flat 요금을
// 넣으면 절감폭이 작아지는 것까지 정직하게 계산된다.

import { IoTReading, HEALTHY_RANGES } from "./iot-health";
import { getCrop } from "./crop-profiles";
import { mulberry32, gaussFrom } from "./prng";

// 계통 전력 배출계수 (kg CO2/kWh) — 한국 2024 근사. 절감 kWh를 CO2로 환산해
// ESG 리포트·투자자 대시보드에 올리는 데 쓴다(거시 재무 환산).
export const GRID_EMISSION_FACTOR = 0.459;

// 시간대별 계통 탄소집약도 배율 — 낮(태양광 다량)은 배출 낮고 저녁 피크는 높다.
// TOU 요금과 같은 방향이라, LED를 저렴 시간대로 옮기면 원과 CO2가 함께 준다
// (Economic MPC의 탄소 목적함수 차용, arXiv 2410.23793). 평균 1.0로 정규화.
export const CARBON_INTENSITY_FACTOR: number[] = [
  1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.0, 1.0, 1.0, // 00~08
  0.9, 0.9, 0.75, 0.7, 0.7, 0.75, // 09~14 태양광 피크
  0.9, 1.0, 1.05, 1.25, 1.25, 1.25, // 15~20 저녁 피크
  1.05, 1.0, 1.0, // 21~23
];

// ── ① 전력비: 시간대별 요금 스케줄링 ──────────────────────────────────────
// 2026.4 한전 요금 개편(49년 만의 시간대 개편) 구조 반영:
//  - 낮 11~15시: 태양광 잉여로 요금 인하(경부하성 시간대로 재분류)
//  - 저녁 18~21시: 최대부하로 편입
// 아래 단가는 일반용(을) 저압 기준의 근사치(원/kWh)이며 확정 계약종·고시가로
// 교체하는 지점이다. 농사용(을) 확정 시 TARIFF_FLAT_AGRI로 교체.
export const TARIFF_TOU_GENERAL: number[] = [
  110, 110, 110, 110, 110, 110, 110, 110, 110, // 00~08 경부하
  150, 150,                                     // 09~10 중간부하
  130, 130, 130, 130,                           // 11~14 낮 할인(개편 신설)
  150, 150, 150,                                // 15~17 중간부하
  210, 210, 210,                                // 18~20 최대부하(개편 편입)
  150, 150,                                     // 21~22 중간부하
  110,                                          // 23    경부하
];

export const TARIFF_FLAT_AGRI: number[] = Array(24).fill(53); // 농사용(을) 근사 flat

export interface LedBlock {
  startHour: number; // 0~23
  hours: number;
}

export interface PowerPlan {
  baselineBlocks: LedBlock[];
  optimizedBlocks: LedBlock[];
  baselineCostPerDay: number; // 원
  optimizedCostPerDay: number; // 원
  savingPerDay: number;
  savingPerMonth: number;
  savingRate: number; // 0~1
}

function blockCost(block: LedBlock, powerKw: number, tariff: number[]): number {
  let cost = 0;
  for (let i = 0; i < block.hours; i++) {
    cost += powerKw * tariff[(block.startHour + i) % 24];
  }
  return cost;
}

function blocksCost(blocks: LedBlock[], powerKw: number, tariff: number[]): number {
  return blocks.reduce((s, b) => s + blockCost(b, powerKw, tariff), 0);
}

// 광주기는 잦은 분할이 생육에 부담이므로 연속 1블록 또는 2블록(각 4h 이상)만
// 허용한다. 탐색 공간이 작아(24×24×시간 분할) 전수 탐색으로 최적해를 구한다.
export function optimizeLedSchedule(opts: {
  photoperiodHours: number; // 새싹삼 기본 14h
  ledPowerKw: number;
  tariff?: number[];
  baselineStartHour?: number; // 관행 스케줄(기본 08시 점등)
}): PowerPlan {
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const P = opts.photoperiodHours;
  const baseline: LedBlock[] = [
    { startHour: opts.baselineStartHour ?? 8, hours: P },
  ];

  // 후보 1: 최적 연속 1블록
  let best: LedBlock[] = baseline;
  let bestCost = Infinity;
  for (let s = 0; s < 24; s++) {
    const cand = [{ startHour: s, hours: P }];
    const c = blocksCost(cand, opts.ledPowerKw, tariff);
    if (c < bestCost) {
      bestCost = c;
      best = cand;
    }
  }

  // 후보 2: 2블록 분할 (각 블록 최소 4h, 블록 간 겹침 없음)
  const MIN_BLOCK = 4;
  for (let h1 = MIN_BLOCK; h1 <= P - MIN_BLOCK; h1++) {
    const h2 = P - h1;
    for (let s1 = 0; s1 < 24; s1++) {
      for (let s2 = 0; s2 < 24; s2++) {
        // 블록 겹침 검사 (원형 24h)
        const occupied = new Set<number>();
        for (let i = 0; i < h1; i++) occupied.add((s1 + i) % 24);
        let overlap = false;
        for (let i = 0; i < h2; i++) {
          if (occupied.has((s2 + i) % 24)) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;
        const cand = [
          { startHour: s1, hours: h1 },
          { startHour: s2, hours: h2 },
        ];
        const c = blocksCost(cand, opts.ledPowerKw, tariff);
        if (c < bestCost) {
          bestCost = c;
          best = cand;
        }
      }
    }
  }

  const baselineCost = blocksCost(baseline, opts.ledPowerKw, tariff);
  const saving = baselineCost - bestCost;
  return {
    baselineBlocks: baseline,
    optimizedBlocks: best,
    baselineCostPerDay: Math.round(baselineCost),
    optimizedCostPerDay: Math.round(bestCost),
    savingPerDay: Math.round(saving),
    savingPerMonth: Math.round(saving * 30),
    savingRate: baselineCost > 0 ? saving / baselineCost : 0,
  };
}

// ── ①-DLI: 일적산광량 기반 광주기 최적화 (농학적으로 옳은 제어) ───────────
// "14시간 점등"이 아니라 "목표 DLI를 충족하는 최소 요금 배치"를 푼다.
// DLI(mol/m²/day) = PPFD(μmol/m²/s) × 3600 × 광시간(h) / 1e6.
// 목표 DLI를 채우는 데 필요한 최대광량 시간을 계산하고, 그 시간을 가장 싼
// TOU 슬롯에 배치한다. 생육(DLI)은 하드 제약으로 보존되므로 "싸게 켜도 작물은
// 똑같이 자란다"가 성립한다 — 전력 절감의 농학적 정당화(Economic MPC, arXiv 2410.23793).
export interface DliPlan {
  cropLabel: string;
  dliTarget: number;
  requiredHours: number; // 최대 PPFD에서 목표 DLI 충족에 필요한 광시간
  achievedDli: number;
  feasible: boolean; // 24h 내 충족 가능한가 (아니면 PPFD 상향 필요)
  litHours: number[]; // 점등 시간대 (원형 24h)
  costPerDay: number; // 원 — TOU 최적 배치
  naiveCostPerDay: number; // 08시 연속 점등 관행
  savingPerDay: number;
  savingPerMonth: number;
  co2SavedKgPerMonth: number;
}

export function dliSchedule(opts: {
  cropKey?: string;
  ledPowerKw: number;
  tariff?: number[];
  dliTarget?: number;
  ppfd?: number;
}): DliPlan {
  const crop = getCrop(opts.cropKey);
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const dliTarget = opts.dliTarget ?? crop.dliTarget;
  const ppfd = opts.ppfd ?? crop.ppfd;

  // 필요 광시간 = DLI 목표 / (PPFD 시간당 기여). 반올림 올림(정수 시간 슬롯).
  const dliPerHour = (ppfd * 3600) / 1e6;
  const requiredHoursRaw = dliTarget / dliPerHour;
  const requiredHours = Math.min(24, Math.ceil(requiredHoursRaw));
  const feasible = requiredHoursRaw <= 24;
  const achievedDli = Math.round(requiredHours * dliPerHour * 10) / 10;

  // 최적 배치: 가장 싼 시간부터 requiredHours개 선택
  const order = [...Array(24).keys()].sort((a, b) => tariff[a] - tariff[b]);
  const litHours = order.slice(0, requiredHours).sort((a, b) => a - b);
  const costPerDay = litHours.reduce((s, h) => s + opts.ledPowerKw * tariff[h], 0);

  // 관행: 08시부터 연속 점등
  const naive = Array.from({ length: requiredHours }, (_, i) => (8 + i) % 24);
  const naiveCostPerDay = naive.reduce((s, h) => s + opts.ledPowerKw * tariff[h], 0);

  const savingPerDay = naiveCostPerDay - costPerDay;
  // CO2: kWh는 같지만(같은 시간 켬) 저탄소 시간대로 옮기면 배출이 준다.
  // 시간대 배출 = kWh × 평균배출계수 × 시간대 배율.
  const co2Of = (hours: number[]) =>
    hours.reduce(
      (s, h) => s + opts.ledPowerKw * GRID_EMISSION_FACTOR * CARBON_INTENSITY_FACTOR[h],
      0
    );
  const co2SavedKgPerMonth =
    Math.round((co2Of(naive) - co2Of(litHours)) * 30 * 10) / 10;
  return {
    cropLabel: crop.label,
    dliTarget,
    requiredHours,
    achievedDli,
    feasible,
    litHours,
    costPerDay: Math.round(costPerDay),
    naiveCostPerDay: Math.round(naiveCostPerDay),
    savingPerDay: Math.round(savingPerDay),
    savingPerMonth: Math.round(savingPerDay * 30),
    co2SavedKgPerMonth,
  };
}

// ── ①-피드백: 닫힌 루프 DLI 보정 (arXiv 2512.01167의 피드백 원리) ──────────
// 고정 스케줄이 아니라, 실측 조도로 계산한 실현 DLI가 목표에 미달/초과하면
// 다음날 광시간을 비례 보정한다. Q-learning 없이 피드백 원리만 이식.
export interface DliFeedback {
  realizedDli: number; // 최근 관측 조도로 추정한 실현 DLI
  targetDli: number;
  gapPct: number;
  action: string;
}

export function dliFeedback(opts: {
  cropKey?: string;
  recentLux: number[]; // 최근 24h 시간당 조도(lux)
}): DliFeedback {
  const crop = getCrop(opts.cropKey);
  // lux → PPFD 근사(백색 LED ~0.015 μmol/m²/s per lux), 시간당 적산
  const dliPerLuxHour = (0.015 * 3600) / 1e6;
  const realizedDli =
    Math.round(opts.recentLux.reduce((s, l) => s + l * dliPerLuxHour, 0) * 10) /
    10;
  const gapPct = Math.round(((realizedDli - crop.dliTarget) / crop.dliTarget) * 1000) / 10;
  let action: string;
  if (gapPct < -10) action = `목표 대비 ${gapPct}% 부족 — 익일 광시간/광량 상향`;
  else if (gapPct > 10) action = `목표 대비 +${gapPct}% 초과 — 익일 광량 하향(전력 절감)`;
  else action = `목표 근접(${gapPct}%) — 현 스케줄 유지`;
  return { realizedDli, targetDli: crop.dliTarget, gapPct, action };
}

// ── ② 관리비: 예지보전 (드리프트 탐지) ────────────────────────────────────
// iot-health의 Z-score는 "지금 튀었나"(스파이크)를 본다. 예지보전은 반대로
// "서서히 밀리고 있나"(드리프트)를 본다 — 펌프 막힘·센서 열화·히터 성능 저하는
// 스파이크가 아니라 완만한 평균 이동으로 나타나기 때문. 윈도우를 전/후반으로
// 갈라 평균 이동량을 전반부 표준편차 단위로 잰다.
export interface MaintenanceReport {
  riskScore: number; // 최대 드리프트 (σ 단위)
  driftingSensors: { sensor: string; drift: number }[];
  recommendation: string;
}

const DRIFT_THRESHOLD = 2; // 2σ 이상 평균 이동 = 점검 권고

export function maintenanceRisk(readings: IoTReading[]): MaintenanceReport {
  if (readings.length < 8) {
    return {
      riskScore: 0,
      driftingSensors: [],
      recommendation: "데이터 부족 — 판정 보류 (최소 8건 필요)",
    };
  }
  const half = Math.floor(readings.length / 2);
  const first = readings.slice(0, half);
  const second = readings.slice(half);

  const sensors = Object.keys(HEALTHY_RANGES) as (keyof IoTReading)[];
  const drifts = sensors.map((key) => {
    const f = first.map((r) => r[key]);
    const s = second.map((r) => r[key]);
    const fMean = f.reduce((a, b) => a + b, 0) / f.length;
    const sMean = s.reduce((a, b) => a + b, 0) / s.length;
    const fStd = Math.sqrt(
      f.reduce((a, b) => a + (b - fMean) ** 2, 0) / f.length
    );
    const drift = fStd > 0 ? Math.abs(sMean - fMean) / fStd : 0;
    return { sensor: key, drift: Math.round(drift * 100) / 100 };
  });

  const drifting = drifts.filter((d) => d.drift > DRIFT_THRESHOLD);
  const riskScore = Math.max(...drifts.map((d) => d.drift));
  return {
    riskScore: Math.round(riskScore * 100) / 100,
    driftingSensors: drifting,
    recommendation:
      drifting.length > 0
        ? `드리프트 감지(${drifting.map((d) => d.sensor).join(", ")}) — 다음 정기 방문 시 점검 항목에 추가 (긴급 출동 불필요)`
        : "정상 — 계획 방문 주기 유지",
  };
}

// ── ③ 자원: 수요 연동 파종 + 양액 보정 ────────────────────────────────────
// 판매 예측에 파종량을 맞추면 폐기가 준다. "많이 심고 남으면 버리는" 관행 대비
// 절감분을 계산해 보여준다.
export interface SeedingPlan {
  recommendedUnits: number; // 파종 권고량 (포기)
  conventionalUnits: number; // 관행(최대 생산능력) 파종량
  expectedWasteReduction: number; // 절감 포기 수/사이클
  note: string;
}

export function seedingPlan(opts: {
  monthlySalesForecast: number; // 포기
  lossRate?: number; // 생육 손실률 (기본 8%)
  capacityUnits?: number; // 시설 최대 생산능력 (기본 500)
}): SeedingPlan {
  const loss = opts.lossRate ?? 0.08;
  const capacity = opts.capacityUnits ?? 500;
  const recommended = Math.min(
    capacity,
    Math.ceil(opts.monthlySalesForecast / (1 - loss))
  );
  const wasteReduction = Math.max(0, capacity - recommended);
  return {
    recommendedUnits: recommended,
    conventionalUnits: capacity,
    expectedWasteReduction: wasteReduction,
    note:
      wasteReduction > 0
        ? `수요 예측(${opts.monthlySalesForecast}포기) 기준 ${recommended}포기 파종 권고 — 관행 대비 ${wasteReduction}포기 폐기 절감`
        : "수요가 생산능력을 초과 — 전량 파종 + B2B 추가 판로 검토",
  };
}

export interface NutrientAdvice {
  status: "ok" | "adjust";
  message: string;
}

export function nutrientAdvice(latest: IoTReading, cropKey?: string): NutrientAdvice {
  const [lo, hi] = getCrop(cropKey).healthyRanges.phLevel;
  if (latest.phLevel < lo) {
    return {
      status: "adjust",
      message: `양액 pH ${latest.phLevel.toFixed(2)} — 하한(${lo}) 미달, pH 상향 보정제 투입 권고`,
    };
  }
  if (latest.phLevel > hi) {
    return {
      status: "adjust",
      message: `양액 pH ${latest.phLevel.toFixed(2)} — 상한(${hi}) 초과, 산도 보정 권고`,
    };
  }
  return { status: "ok", message: `양액 pH ${latest.phLevel.toFixed(2)} — 적정 범위 유지` };
}

// ── ④ 수요 예측: Holt-Winters 가법 지수평활 (주간 계절성) ──────────────────
// 파종 계획의 입력이던 "판매 예측"을 가정값이 아니라 POS 판매 시계열에서
// 학습한다. 소매 판매는 요일 패턴(주말 피크)이 강하므로 season=7 가법 모델.
// 외부 의존성 없는 표준 구현 — 데이터가 2시즌(14일) 미만이면 이동평균 폴백.
export interface DemandForecast {
  method: "holt-winters" | "moving-average";
  dailyForecast: number[]; // horizon일 예측
  monthlyTotal: number; // 30일 합계 (파종 계획 입력)
  weeklySeasonality: number[]; // 학습된 요일 효과 (월~일 아님 — 시계열 시작 요일 기준)
}

export function holtWintersForecast(
  series: number[],
  opts?: { seasonLength?: number; horizon?: number; alpha?: number; beta?: number; gamma?: number }
): DemandForecast {
  const m = opts?.seasonLength ?? 7;
  const horizon = opts?.horizon ?? 30;
  const alpha = opts?.alpha ?? 0.3;
  const beta = opts?.beta ?? 0.05;
  const gamma = opts?.gamma ?? 0.2;

  if (series.length < 2 * m) {
    const mean =
      series.length > 0 ? series.reduce((a, b) => a + b, 0) / series.length : 0;
    const daily = Array(horizon).fill(Math.max(0, mean));
    return {
      method: "moving-average",
      dailyForecast: daily.map((v) => Math.round(v)),
      monthlyTotal: Math.round(mean * 30),
      weeklySeasonality: Array(m).fill(0),
    };
  }

  // 초기화: 첫 시즌 평균 = level, 시즌 간 평균 증분 = trend, 첫 시즌 편차 = seasonal
  const firstSeason = series.slice(0, m);
  let level = firstSeason.reduce((a, b) => a + b, 0) / m;
  const secondSeason = series.slice(m, 2 * m);
  const secondMean = secondSeason.reduce((a, b) => a + b, 0) / m;
  let trend = (secondMean - level) / m;
  const seasonal = firstSeason.map((v) => v - level);

  for (let i = 0; i < series.length; i++) {
    const s = i % m;
    const prevLevel = level;
    level = alpha * (series[i] - seasonal[s]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[s] = gamma * (series[i] - level) + (1 - gamma) * seasonal[s];
  }

  const dailyForecast: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const s = (series.length + h - 1) % m;
    dailyForecast.push(Math.max(0, Math.round(level + h * trend + seasonal[s])));
  }
  return {
    method: "holt-winters",
    dailyForecast,
    monthlyTotal: dailyForecast.slice(0, 30).reduce((a, b) => a + b, 0),
    weeklySeasonality: seasonal.map((v) => Math.round(v * 10) / 10),
  };
}

// ── ⑤ 예지보전 v2: CUSUM 관리도 (양측 누적합) ─────────────────────────────
// 전/후반 평균 비교(maintenanceRisk)는 "밀렸다"만 알려준다. CUSUM은 산업 표준
// 드리프트 탐지로, 기준선 대비 편차의 누적합이 임계(h)를 넘는 "시점"까지
// 특정한다 — 언제부터 열화가 시작됐는지가 곧 점검 계획의 입력이다.
// 기준선은 윈도우 앞 1/4에서 추정, slack k=0.5σ, 임계 h=5σ (관리도 관행값).
export interface CusumResult {
  sensor: string;
  detected: boolean;
  detectedIndex: number | null; // readings 배열상 최초 교차 시점
  maxStatistic: number; // σ 단위
}

// 온실 데이터는 주야 사이클(계절성)이 강해 원시값에 CUSUM을 걸면 사이클
// 자체를 드리프트로 오탐한다. 24시간 차분(x[i] − x[i−lag], lag=48@30분 간격)으로
// 계절성을 제거한 뒤 관리도를 적용한다 — 정상이면 차분이 0 근방, 열화면
// 차분이 지속적으로 한쪽으로 쏠린다.
// lightIntensity는 제외 — 점등/소등의 이중 상태(regime-switching) 센서라
// 주야간 노이즈 산포가 달라 관리도의 균질 산포 전제가 성립하지 않는다.
// 조명 이상은 드리프트가 아니라 "스케줄 준수·범위" 문제이며 iot-health의
// 가동률 게이트가 담당한다.
const CUSUM_SENSORS: (keyof IoTReading)[] = [
  "temperature",
  "humidity",
  "co2Level",
  "phLevel",
];

export function cusumDrift(
  readings: IoTReading[],
  opts?: { lag?: number }
): CusumResult[] {
  const K = 0.5;
  const H = 5;
  const lag = opts?.lag ?? 48;
  const sensors = CUSUM_SENSORS;

  return sensors.map((key) => {
    if (readings.length < lag + 12) {
      return { sensor: key, detected: false, detectedIndex: null, maxStatistic: 0 };
    }
    // 계절 차분 시계열
    const diffs: number[] = [];
    for (let i = lag; i < readings.length; i++) {
      diffs.push(readings[i][key] - readings[i - lag][key]);
    }
    // 산포 추정: 주야간 노이즈 크기가 달라(이분산) 특정 구간만으로 σ를 잡으면
    // 오탐한다. 전체 차분의 MAD(중앙절대편차 × 1.4826) — 드리프트 구간이 섞여
    // 있어도 중앙값 기반이라 강건하다.
    const sorted = [...diffs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const absDev = diffs.map((d) => Math.abs(d - median)).sort((a, b) => a - b);
    const mean = median;
    const std = 1.4826 * absDev[Math.floor(absDev.length / 2)] || 1e-9;
    const baseN = Math.max(8, Math.floor(diffs.length / 4));

    let cPos = 0;
    let cNeg = 0;
    let maxStat = 0;
    let detectedIndex: number | null = null;
    for (let i = baseN; i < diffs.length; i++) {
      const z = (diffs[i] - mean) / std;
      cPos = Math.max(0, cPos + z - K);
      cNeg = Math.max(0, cNeg - z - K);
      const stat = Math.max(cPos, cNeg);
      if (stat > maxStat) maxStat = stat;
      if (stat > H && detectedIndex === null) detectedIndex = i + lag; // 원본 인덱스로 환산
    }
    return {
      sensor: key,
      detected: detectedIndex !== null,
      detectedIndex,
      maxStatistic: Math.round(maxStat * 10) / 10,
    };
  });
}

// ── ⑧ 외부기상 차분 CUSUM: 계절변화 상쇄, 설비열화만 탐지 ──────────────────
// 온실 내부온도는 외부기온을 따라간다 — 원시 CUSUM은 계절 하강을 설비 드리프트로
// 오탐한다(실데이터에서 실제로 관측됨). 내부-외부 온도차(differential)에 관리도를
// 걸면 계절 성분이 상쇄되고, 히터·차광·단열 성능 저하만 차분의 이동으로 남는다.
// (RL-Guided MPC의 외란 보상 원리, arXiv 2506.13278 — 여기선 통계적 차분으로 경량 구현.)
export interface WeatherCompensatedResult {
  detected: boolean;
  detectedIndex: number | null;
  maxStatistic: number;
  baselineDiff: number; // 정상 가동 시 내외기 온도차 중앙값
  note: string;
}

export function weatherCompensatedCusum(
  internal: number[],
  external: number[],
  opts?: { fleetPrior?: { median: number; mad: number } }
): WeatherCompensatedResult {
  const n = Math.min(internal.length, external.length);
  if (n < 12) {
    return {
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      baselineDiff: 0,
      note: "데이터 부족",
    };
  }
  const diff = Array.from({ length: n }, (_, i) => internal[i] - external[i]);
  const sorted = [...diff].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const absDev = diff.map((d) => Math.abs(d - median)).sort((a, b) => a - b);
  // 신규 사이트(자체 이력 부족)는 플릿 사전분포로 부트스트랩(teacher-student 콜드스타트).
  const useFleet = n < 48 && opts?.fleetPrior;
  const center = useFleet ? opts!.fleetPrior!.median : median;
  const scale = useFleet
    ? opts!.fleetPrior!.mad
    : 1.4826 * absDev[Math.floor(n / 2)] || 1e-9;

  const K = 0.5;
  const H = 5;
  const baseN = Math.max(8, Math.floor(n / 4));
  let cPos = 0;
  let cNeg = 0;
  let maxStat = 0;
  let detectedIndex: number | null = null;
  for (let i = baseN; i < n; i++) {
    const z = (diff[i] - center) / scale;
    cPos = Math.max(0, cPos + z - K);
    cNeg = Math.max(0, cNeg - z - K);
    const stat = Math.max(cPos, cNeg);
    if (stat > maxStat) maxStat = stat;
    if (stat > H && detectedIndex === null) detectedIndex = i;
  }
  return {
    detected: detectedIndex !== null,
    detectedIndex,
    maxStatistic: Math.round(maxStat * 10) / 10,
    baselineDiff: Math.round(center * 10) / 10,
    note: useFleet
      ? "플릿 사전분포로 판정(자체 이력 축적 전 콜드스타트)"
      : detectedIndex !== null
        ? "내외기 차분 이동 감지 — 계절 아닌 설비 요인(단열/히터/차광) 점검"
        : "차분 안정 — 설비 정상(계절 변화는 상쇄됨)",
  };
}

// ── ⑨ 보광 트리거: 외부일사량 연동 (그린씨에스 LED 이력 실측 로직) ──────────
// 온실 하이브리드: 자연광이 DLI에 미달하는 시간에만 LED를 보광한다. 실데이터에서
// 딸기 온실은 보광등을 전체의 0.6%만 사용(햇빛 의존) — 반대로 실내 수직농장은
// 자연광 0이라 DLI 전량을 LED로 채워야 하며, 이 트리거가 그 경계를 계산한다.
export interface SupplementalPlan {
  mode: "greenhouse-hybrid" | "indoor-full";
  supplementHours: number[]; // 보광 필요 시간대
  naturalDliShare: number; // 자연광이 채우는 DLI 비율 (0~1)
  ledDliShare: number;
}

export function supplementalTrigger(opts: {
  cropKey?: string;
  hourlyInsolation: number[]; // 24h 외부일사량 W/m²
  indoor?: boolean; // 실내 수직농장이면 자연광 0
}): SupplementalPlan {
  const crop = getCrop(opts.cropKey);
  if (opts.indoor) {
    return {
      mode: "indoor-full",
      supplementHours: [],
      naturalDliShare: 0,
      ledDliShare: 1,
    };
  }
  // 외부일사량(W/m²) → 실내 도달 PAR DLI 근사. 투과율 0.5, W/m²→PPFD ~2.02.
  const TRANSMISSION = 0.5;
  const hourlyDli = opts.hourlyInsolation.map(
    (w) => (w * TRANSMISSION * 2.02 * 3600) / 1e6
  );
  const naturalDli = hourlyDli.reduce((a, b) => a + b, 0);
  const naturalShare = Math.min(1, naturalDli / crop.dliTarget);
  // 자연광이 약한 시간(일사량 하위)에 보광
  const shortfall = Math.max(0, crop.dliTarget - naturalDli);
  const supplementHours =
    shortfall > 0
      ? opts.hourlyInsolation
          .map((w, h) => ({ w, h }))
          .sort((a, b) => a.w - b.w)
          .slice(0, Math.ceil(shortfall / crop.dliTarget * 24))
          .map((x) => x.h)
          .sort((a, b) => a - b)
      : [];
  return {
    mode: "greenhouse-hybrid",
    supplementHours,
    naturalDliShare: Math.round(naturalShare * 100) / 100,
    ledDliShare: Math.round((1 - naturalShare) * 100) / 100,
  };
}

// ── ⑦ 통합 스케줄 최적화: 시뮬레이티드 어닐링 (SA) ─────────────────────────
// ①(전력량요금)과 ⑥(기본요금)을 2단계로 따로 풀면 국소해에 갇힐 수 있다.
// 반도체 배치·물류 라우팅에서 쓰는 메타휴리스틱(SA)으로 두 비용을 하나의
// 목적함수(월 전력량요금 + 월 기본요금)로 합쳐 전역 탐색한다.
// 재현성: 시드 고정 PRNG(mulberry32) — 데모마다 같은 결과. mulberry32는 ./prng 공유 모듈.

export interface JointSchedule {
  assignments: { name: string; hours: number[] }[];
  energyCostPerMonth: number;
  demandChargePerMonth: number;
  totalPerMonth: number;
  baselineTotalPerMonth: number; // 2단계(①+⑥) 해의 총비용
  improvementPerMonth: number; // SA가 2단계 해 대비 추가로 깎은 금액 (0이면 이미 최적)
}

export function annealJointSchedule(opts: {
  ledPowerKw: number;
  photoperiodHours: number;
  flexLoads: { name: string; kw: number; hoursNeeded: number }[];
  tariff?: number[];
  iterations?: number;
  seed?: number;
}): JointSchedule {
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const rand = mulberry32(opts.seed ?? 42);
  const iters = opts.iterations ?? 30000;
  const P = opts.photoperiodHours;

  // 상태: LED = (분할 h1, 시작1, 시작2) — ①과 같은 1~2블록 제약 유지.
  //       유연 부하 = 시간 집합(비트마스크 대신 배열).
  type State = { ledSplit: number; ledS1: number; ledS2: number; flex: number[][] };

  const ledHoursOf = (s: State): number[] => {
    const h1 = s.ledSplit;
    const hours = [];
    for (let i = 0; i < h1; i++) hours.push((s.ledS1 + i) % 24);
    for (let i = 0; i < P - h1; i++) hours.push((s.ledS2 + i) % 24);
    return hours;
  };

  const cost = (s: State): number => {
    const profile = Array(24).fill(0);
    const led = ledHoursOf(s);
    if (new Set(led).size !== P) return Infinity; // LED 블록 겹침 금지
    for (const h of led) profile[h] += opts.ledPowerKw;
    s.flex.forEach((hours, i) => {
      for (const h of hours) profile[h] += opts.flexLoads[i].kw;
    });
    let energyDay = 0;
    for (let h = 0; h < 24; h++) energyDay += profile[h] * tariff[h];
    const peak = Math.max(...profile);
    return energyDay * 30 + peak * DEMAND_CHARGE_PER_KW;
  };

  // 초기해 = 2단계 해 (① TOU 최적 LED + ⑥ 그리디 스태거링)
  const power = optimizeLedSchedule({ photoperiodHours: P, ledPowerKw: opts.ledPowerKw, tariff });
  const b = power.optimizedBlocks;
  const init: State = {
    ledSplit: b[0].hours,
    ledS1: b[0].startHour,
    ledS2: b.length > 1 ? b[1].startHour : (b[0].startHour + b[0].hours) % 24,
    flex: [],
  };
  const ledFixed = ledHoursOf(init);
  const greedy = peakStagger([
    { name: "LED", kw: opts.ledPowerKw, hoursNeeded: P, fixedHours: ledFixed },
    ...opts.flexLoads,
  ]);
  init.flex = opts.flexLoads.map(
    (l) => greedy.assignments.find((a) => a.name === l.name)!.hours
  );
  const baselineCost = cost(init);

  let cur: State = JSON.parse(JSON.stringify(init));
  let curCost = baselineCost;
  let best = cur;
  let bestCost = curCost;

  for (let it = 0; it < iters; it++) {
    const temp = 1000 * (1 - it / iters) + 1;
    const next: State = JSON.parse(JSON.stringify(cur));
    const move = Math.floor(rand() * 3);
    if (move === 0) {
      next.ledS1 = Math.floor(rand() * 24);
    } else if (move === 1) {
      next.ledS2 = Math.floor(rand() * 24);
      next.ledSplit = 4 + Math.floor(rand() * Math.max(1, P - 8)); // 각 블록 4h+
    } else if (opts.flexLoads.length > 0) {
      const li = Math.floor(rand() * opts.flexLoads.length);
      const hours = new Set(next.flex[li]);
      const from = next.flex[li][Math.floor(rand() * next.flex[li].length)];
      let to = Math.floor(rand() * 24);
      if (hours.has(to)) to = (to + 1) % 24;
      hours.delete(from);
      hours.add(to);
      next.flex[li] = [...hours];
      if (next.flex[li].length !== opts.flexLoads[li].hoursNeeded) continue;
    }
    const c = cost(next);
    if (c < curCost || rand() < Math.exp((curCost - c) / temp)) {
      cur = next;
      curCost = c;
      if (c < bestCost) {
        best = next;
        bestCost = c;
      }
    }
  }

  const profile = Array(24).fill(0);
  const ledHours = ledHoursOf(best).sort((a, z) => a - z);
  for (const h of ledHours) profile[h] += opts.ledPowerKw;
  best.flex.forEach((hours, i) => {
    for (const h of hours) profile[h] += opts.flexLoads[i].kw;
  });
  let energyDay = 0;
  for (let h = 0; h < 24; h++) energyDay += profile[h] * tariff[h];
  const peak = Math.max(...profile);

  return {
    assignments: [
      { name: "LED", hours: ledHours },
      ...opts.flexLoads.map((l, i) => ({
        name: l.name,
        hours: [...best.flex[i]].sort((a, z) => a - z),
      })),
    ],
    energyCostPerMonth: Math.round(energyDay * 30),
    demandChargePerMonth: Math.round(peak * DEMAND_CHARGE_PER_KW),
    totalPerMonth: Math.round(bestCost),
    baselineTotalPerMonth: Math.round(baselineCost),
    improvementPerMonth: Math.round(baselineCost - bestCost),
  };
}

// ── ⑧ 가우시안 톰슨 샘플링 (멀티암드 밴딧) ────────────────────────────────
// "확실한 선택만 하면 더 나은 걸 영영 모르고(탐색 부족), 실험만 하면 손해(활용
// 부족)"의 균형 문제를 광고 추천 시스템의 표준 기법으로 푼다. 각 선택지의 보상을
// 정규분포 사후로 추정해 샘플링 배분한다. 품목이 고정이어도 아래 두 결정이 살아있어
// 밴딧이 필요하다 (미시: 품종/레시피 선택 · 중간: 사이트 간 품목 배분).
// 파라미터는 시뮬레이션 — 실측 수율·마진이 쌓이면 그대로 실데이터로 동작.
export interface BanditArm {
  name: string;
  trueMeanMargin: number; // 시뮬레이션용 실제 평균 보상 — 실전에선 미지(관측으로 추정)
  trueStd: number;
}

export interface BanditAllocation {
  rounds: number;
  allocation: { name: string; trays: number; share: number; posteriorMean: number }[];
  banditTotalMargin: number;
  uniformTotalMargin: number; // 균등 배분 대비
  uplift: number;
}

// 호환 별칭 (구 API)
export type CropArm = BanditArm;
export type CropAllocation = BanditAllocation;

// ── 실데이터 밴딧: 관측 누적 상태 + 갱신 인터페이스 ──────────────────────────
// thompsonAllocation은 trueMeanMargin(정답)을 요구 — 시뮬레이션 전용.
// 실운영에서는 관측 보상이 쌓일수록 사후를 갱신해야 한다. 아래 인터페이스로
// 실측 마진을 누적하면 동일한 톰슨 샘플링이 실데이터로 동작한다.
export interface BanditState {
  n: number[];     // 각 팔 관측 횟수
  sum: number[];   // 관측 보상 합계 (사후평균 = sum/n)
  sumSq: number[]; // 관측 보상 제곱합 (분산 계산용)
}

export function initBanditState(numArms: number): BanditState {
  return {
    n: Array(numArms).fill(0),
    sum: Array(numArms).fill(0),
    sumSq: Array(numArms).fill(0),
  };
}

// 관측 한 건을 사후에 반영한 새 상태 반환 (불변 업데이트).
export function thompsonUpdate(
  state: BanditState,
  obs: { arm: number; reward: number }
): BanditState {
  const n = [...state.n];
  const sum = [...state.sum];
  const sumSq = [...state.sumSq];
  n[obs.arm] += 1;
  sum[obs.arm] += obs.reward;
  sumSq[obs.arm] += obs.reward * obs.reward;
  return { n, sum, sumSq };
}

// 현재 상태에서 톰슨 샘플링으로 다음에 할당할 팔 인덱스 반환.
// seed 없으면 Math.random 사용 (라이브 배정). seed 있으면 재현 가능.
export function thompsonSample(state: BanditState, seed?: number): number {
  const rand = seed != null ? mulberry32(seed) : Math.random.bind(Math);
  const gauss = gaussFrom(rand);
  const samples = state.n.map((ni, i) => {
    if (ni < 2) return 1e9 - i; // 미탐색 팔 우선
    const mean = state.sum[i] / ni;
    const variance = Math.max(1, (state.sumSq[i] - (state.sum[i] ** 2) / ni) / (ni - 1));
    return mean + gauss() * Math.sqrt(variance / ni);
  });
  return samples.indexOf(Math.max(...samples));
}

// ── ⑩ 거시: 재무 환산 운영 리포트 ─────────────────────────────────────────
// 최적화 산출을 전부 원/CO2/신뢰도로 환산해 하나의 리포트로 묶는다. 이 숫자가
// 투자자 대시보드·STO 청약자료·ESG 리포트에 그대로 올라간다 — 최적화를
// "설정값 튜닝"이 아니라 "재무 성과"로 만드는 거시 계층(Economic MPC 프레이밍).
export interface OperationsSavings {
  monthlyWonSaved: number; // 사이트당 월 원 절감 합계 (비중복 레버만)
  monthlyCo2SavedKg: number;
  annualWonSaved: number;
  breakdown: { lever: string; wonPerMonth: number }[];
  sumOfIndependentLevers: number; // 독립 레버 단순 합산 (비중복 세 레버를 더한 수치 — SA 검증치 아님)
  confidence: "measured" | "projected"; // 실측 전이면 projected(상방)
  note: string;
}

export function operationsSavingsReport(opts: {
  dliSavingPerMonth: number; // 전력량요금 절감 (LED 시간 이동)
  peakSavingPerMonth: number; // 기본요금 절감 (피크 분산) — 서로 다른 요금 축이라 비중복
  saImprovementPerMonth: number; // SA 통합 최적화가 찾은 추가분
  wasteReductionUnits: number;
  unitPrice?: number; // 폐기 절감 1포기 가치(원)
  dliCo2PerMonth: number;
  confidence?: "measured" | "projected";
}): OperationsSavings {
  const unitPrice = opts.unitPrice ?? 3500;
  const wasteWon = opts.wasteReductionUnits * unitPrice;
  // 합산은 비중복 레버만: 전력량요금(DLI) + 기본요금(피크)은 요금 축이 달라 중복 없음.
  // SA는 이 둘을 동시에 푸는 전역탐색이라 LED 이동분이 DLI와 겹친다 → 합산 제외,
  // "통합 검증치"로만 표기(정직성).
  const breakdown = [
    { lever: "DLI 광주기(전력량요금)", wonPerMonth: opts.dliSavingPerMonth },
    { lever: "피크 분산(기본요금)", wonPerMonth: opts.peakSavingPerMonth },
    { lever: "수요연동 파종(폐기 절감)", wonPerMonth: wasteWon },
  ];
  const monthlyWonSaved = breakdown.reduce((s, b) => s + b.wonPerMonth, 0);
  const confidence = opts.confidence ?? "projected";
  return {
    monthlyWonSaved,
    monthlyCo2SavedKg: Math.round(opts.dliCo2PerMonth * 10) / 10,
    annualWonSaved: monthlyWonSaved * 12,
    breakdown,
    sumOfIndependentLevers:
      opts.dliSavingPerMonth + opts.peakSavingPerMonth + opts.saImprovementPerMonth,
    confidence,
    note:
      confidence === "projected"
        ? "1호점 실측 전 추정치(상방) — 실측 후 measured로 확정, 청약자료엔 measured만 게재"
        : "1호점 실측 확정치 — 투자자 대시보드·ESG 리포트 반영",
  };
}

export function thompsonAllocation(opts: {
  arms: BanditArm[];
  rounds?: number; // 배정 단위 수 (라운드당 1개)
  seed?: number;
}): BanditAllocation {
  const rand = mulberry32(opts.seed ?? 7);
  const rounds = opts.rounds ?? 200;
  const gauss = gaussFrom(rand);

  const stats = opts.arms.map(() => ({ n: 0, sum: 0, sumSq: 0 }));
  let banditTotal = 0;

  for (let r = 0; r < rounds; r++) {
    // 각 팔의 사후 샘플: 관측 없으면 낙관적 초기값(탐색 유도)
    const samples = opts.arms.map((_, i) => {
      const s = stats[i];
      if (s.n < 2) return 1e9 - i; // 미탐색 팔 우선
      const mean = s.sum / s.n;
      const variance = Math.max(1, (s.sumSq - (s.sum * s.sum) / s.n) / (s.n - 1));
      return mean + gauss() * Math.sqrt(variance / s.n);
    });
    const pick = samples.indexOf(Math.max(...samples));
    const reward =
      opts.arms[pick].trueMeanMargin + gauss() * opts.arms[pick].trueStd;
    stats[pick].n += 1;
    stats[pick].sum += reward;
    stats[pick].sumSq += reward * reward;
    banditTotal += reward;
  }

  // 균등 배분 기대치 (비교 기준)
  const uniformTotal =
    (opts.arms.reduce((s, a) => s + a.trueMeanMargin, 0) / opts.arms.length) *
    rounds;

  return {
    rounds,
    allocation: opts.arms.map((a, i) => ({
      name: a.name,
      trays: stats[i].n,
      share: Math.round((stats[i].n / rounds) * 100) / 100,
      posteriorMean: stats[i].n > 0 ? Math.round(stats[i].sum / stats[i].n) : 0,
    })),
    banditTotalMargin: Math.round(banditTotal),
    uniformTotalMargin: Math.round(uniformTotal),
    uplift: Math.round(banditTotal - uniformTotal),
  };
}

// ── ⑥ 피크 수요 분산 (부하 스태거링) ──────────────────────────────────────
// 한전 기본요금은 최대수요전력(피크 kW) 기준이다 — 전력량요금(①)과 별개의
// 두 번째 절감 축. LED·공조·펌프가 같은 시간에 몰리면 피크가 커지므로,
// 각 부하의 필요 가동시간을 지키면서 "시간당 동시 가동 kW의 최댓값"을
// 최소화하도록 시간을 배치한다. 부하별로 가장 붐비지 않는 시간부터 채우는
// 그리디 — 부하 수가 적어(3개) 실용적으로 최적에 근접한다.
export interface LoadSpec {
  name: string;
  kw: number;
  hoursNeeded: number;
  fixedHours?: number[]; // LED처럼 스케줄이 이미 확정된 부하
}

export interface PeakPlan {
  naivePeakKw: number; // 전 부하 08시 동시 시작 관행
  optimizedPeakKw: number;
  assignments: { name: string; hours: number[] }[];
  demandChargeSavingPerMonth: number; // 원 — (피크 절감 kW) × 기본요금 단가
}

const DEMAND_CHARGE_PER_KW = 8320; // 일반용(을) 저압 기본요금 근사(원/kW·월) — 계약종 교체 지점

export function peakStagger(loads: LoadSpec[]): PeakPlan {
  // 관행: 모든 부하가 08시부터 연속 가동
  const naiveProfile = Array(24).fill(0);
  for (const load of loads) {
    for (let i = 0; i < load.hoursNeeded; i++) {
      naiveProfile[(8 + i) % 24] += load.kw;
    }
  }
  const naivePeakKw = Math.max(...naiveProfile);

  // 최적화: 고정 부하 먼저 반영 → 유연 부하는 큰 것부터, 붐비지 않는 시간순 배치
  const profile = Array(24).fill(0);
  const assignments: { name: string; hours: number[] }[] = [];
  const fixed = loads.filter((l) => l.fixedHours);
  const flexible = loads
    .filter((l) => !l.fixedHours)
    .sort((a, b) => b.kw - a.kw);

  for (const load of fixed) {
    for (const h of load.fixedHours!) profile[h % 24] += load.kw;
    assignments.push({ name: load.name, hours: load.fixedHours!.map((h) => h % 24) });
  }
  for (const load of flexible) {
    const hours: number[] = [];
    const order = [...Array(24).keys()].sort((a, b) => profile[a] - profile[b]);
    for (const h of order.slice(0, load.hoursNeeded)) {
      profile[h] += load.kw;
      hours.push(h);
    }
    assignments.push({ name: load.name, hours: hours.sort((a, b) => a - b) });
  }
  const optimizedPeakKw = Math.max(...profile);

  return {
    naivePeakKw: Math.round(naivePeakKw * 10) / 10,
    optimizedPeakKw: Math.round(optimizedPeakKw * 10) / 10,
    assignments,
    demandChargeSavingPerMonth: Math.round(
      Math.max(0, naivePeakKw - optimizedPeakKw) * DEMAND_CHARGE_PER_KW
    ),
  };
}

// ── 밴딧 용도 ①(미시): 품종/재배 레시피 선택 ──────────────────────────────
// 품목이 엽채류로 고정돼도 "어느 품종·어느 재배 레시피가 우리 환경에서 수율·마진이
// 최대인가"는 심어봐야 아는 탐색/활용 문제다. 상추 MPC 논문(arXiv 2507.21669)이
// 다루는 레시피 최적화를 밴딧으로 경량화. arm = 품종 또는 (광량·온도·EC) 레시피.
export function recipeOptimization(opts?: {
  arms?: BanditArm[];
  rounds?: number;
  seed?: number;
}): BanditAllocation {
  const arms = opts?.arms ?? [
    { name: "청상추", trueMeanMargin: 6500, trueStd: 1500 },
    { name: "적상추", trueMeanMargin: 7200, trueStd: 1800 },
    { name: "버터헤드", trueMeanMargin: 8800, trueStd: 3000 },
  ];
  return thompsonAllocation({ arms, rounds: opts?.rounds ?? 200, seed: opts?.seed ?? 11 });
}

// ── 밴딧 용도 ②(중간): 사이트 간 품목 배분 (포트폴리오) ─────────────────────
// 다지점 운영자의 결정: 각 사이트를 엽채류 vs 바질 vs 방울토마토 중 무엇으로
// 배정해야 네트워크 전체 마진이 최대인가. 사이트 스펙(층고)·상권 수요가 달라
// 어느 배합이 최적인지 미지 → 사이트를 조금씩 다르게 배정하며 학습(탐색/활용).
export function cropPortfolioAllocation(opts?: {
  arms?: BanditArm[];
  sites?: number;
  seed?: number;
}): BanditAllocation {
  const arms = opts?.arms ?? [
    { name: "엽채류(상추)", trueMeanMargin: 7000, trueStd: 1800 },
    { name: "바질(허브)", trueMeanMargin: 11000, trueStd: 3500 },
    { name: "방울토마토", trueMeanMargin: 14000, trueStd: 6000 },
  ];
  return thompsonAllocation({ arms, rounds: opts?.sites ?? 30, seed: opts?.seed ?? 13 });
}
