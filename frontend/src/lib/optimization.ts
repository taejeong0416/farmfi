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

export function nutrientAdvice(latest: IoTReading): NutrientAdvice {
  const [lo, hi] = HEALTHY_RANGES.phLevel;
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

// ── ⑦ 통합 스케줄 최적화: 시뮬레이티드 어닐링 (SA) ─────────────────────────
// ①(전력량요금)과 ⑥(기본요금)을 2단계로 따로 풀면 국소해에 갇힐 수 있다.
// 반도체 배치·물류 라우팅에서 쓰는 메타휴리스틱(SA)으로 두 비용을 하나의
// 목적함수(월 전력량요금 + 월 기본요금)로 합쳐 전역 탐색한다.
// 재현성: 시드 고정 PRNG(mulberry32) — 데모마다 같은 결과.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// ── ⑧ 작물 믹스 탐색: 가우시안 톰슨 샘플링 (멀티암드 밴딧) ─────────────────
// v18의 "고부가 작물 전환" 결정을 광고 추천 시스템의 탐색/활용 문제로 푼다:
// 트레이를 어느 작물에 배정해야 마진이 최대인가 — 확실한 작물만 심으면
// 더 나은 작물을 영영 모르고(탐색 부족), 실험만 하면 마진을 잃는다(활용 부족).
// 각 작물의 트레이당 마진을 정규분포 사후로 추정해 샘플링 배분한다.
// 지금은 시뮬레이션 파라미터 — 실측 판매·원가 데이터가 쌓이면 그대로 실데이터로 동작.
export interface CropArm {
  name: string;
  trueMeanMargin: number; // 시뮬레이션용 실제 평균 마진(원/트레이) — 실전에선 미지
  trueStd: number;
}

export interface CropAllocation {
  rounds: number;
  allocation: { name: string; trays: number; share: number; posteriorMean: number }[];
  banditTotalMargin: number;
  uniformTotalMargin: number; // 균등 배분 대비
  uplift: number;
}

export function thompsonCropAllocation(opts: {
  arms: CropArm[];
  rounds?: number; // 배정 트레이 수 (라운드당 1트레이)
  seed?: number;
}): CropAllocation {
  const rand = mulberry32(opts.seed ?? 7);
  const rounds = opts.rounds ?? 200;
  // 표준정규 샘플 (Box-Muller)
  const gauss = () =>
    Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

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
