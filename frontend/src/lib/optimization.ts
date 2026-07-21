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
