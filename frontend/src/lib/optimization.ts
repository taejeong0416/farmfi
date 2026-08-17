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
import { PARAMS } from "./optimization-params";

// 요금·배출·원가 상수는 전부 파라미터 레지스트리에서 온다. 값과 근거(고시/추정/가정)를
// 한 곳에 모아둬야 "이 숫자 어디서 왔나"에 답할 수 있고 교체 지점도 한눈에 보인다.
export const GRID_EMISSION_FACTOR = PARAMS.gridEmissionFactor.value;
export const CARBON_INTENSITY_FACTOR: number[] = PARAMS.carbonIntensityFactor.value;
export const TARIFF_TOU_GENERAL: number[] = PARAMS.tariffTouGeneral.value;
export const TARIFF_FLAT_AGRI: number[] = PARAMS.tariffFlatAgri.value;

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
  photoperiodHours: number; // 엽채류 기본 14h
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

// ── 광량 해석: 목표 DLI → (명기, PPFD, 소비전력) ───────────────────────────
// 스케줄러·이익최적화·통합최적화가 같은 물리를 쓰도록 한 곳에서 푼다.
// DLI(mol/m²/day) = PPFD(μmol/m²/s) × 3600 × 명기(h) / 1e6.
// 설계 PPFD로 목표 DLI를 채우려면 명기가 최대 광주기를 넘을 수 있다. 그때는 PPFD를
// 올려 시간을 압축하는데, 이는 디밍을 푸는 것이므로 소비전력이 같은 비율로 오른다 —
// 시간 압축은 공짜가 아니다. 정격 상한(maxPpfd)을 넘겨야만 담기는 DLI는 그 설비로
// 달성 불가능한 목표이며, 광량 재설계 없이는 선택지가 아니다.
export interface LightingSolution {
  hours: number; // 명기(h)
  ppfd: number; // 실제 운전 PPFD
  ledPowerKw: number; // 그 PPFD에서의 소비전력 (설계값 × PPFD 비)
  darkH: number; // 연속 암기(h) — 연속 블록 배치이므로 24 − 명기
  photoperiodSafe: boolean; // 명기 ≤ 최대광주기 ∧ 암기 ≥ 최소암기
  feasible: boolean; // 정격 PPFD 안에서 달성 가능한가
  achievedDli: number;
}

export function resolveLighting(opts: {
  cropKey?: string;
  dliTarget: number;
  ledPowerKw: number; // 설계 PPFD 기준 소비전력
  ppfd?: number; // 설계 PPFD 오버라이드
}): LightingSolution {
  const crop = getCrop(opts.cropKey);
  const designPpfd = opts.ppfd ?? crop.ppfd;
  const hoursAt = (p: number) => Math.ceil(opts.dliTarget / ((p * 3600) / 1e6));

  let ppfd = designPpfd;
  let hours = hoursAt(ppfd);
  if (hours > crop.maxPhotoperiodH) {
    ppfd = Math.ceil((opts.dliTarget * 1e6) / (crop.maxPhotoperiodH * 3600));
    hours = Math.min(hoursAt(ppfd), crop.maxPhotoperiodH);
  }
  const darkH = 24 - hours;
  return {
    hours,
    ppfd,
    ledPowerKw: opts.ledPowerKw * (ppfd / designPpfd),
    darkH,
    photoperiodSafe: hours <= crop.maxPhotoperiodH && darkH >= crop.minDarkH,
    feasible: ppfd <= crop.maxPpfd && hours <= crop.maxPhotoperiodH,
    achievedDli: Math.round(((ppfd * 3600) / 1e6) * hours * 10) / 10,
  };
}

// ── LED 발열의 시간별 순 열비용 ──────────────────────────────────────────────
// 밀폐 재배실에서 LED는 소비전력의 대부분을 실내 현열로 남긴다. 그 열이 난방을
// 대체하면 이득이고, 남으면 제거해야 하므로 비용이다. 두 항의 크기를 정하는 건
// 외기온도지만, 관계는 선형이 아니다 — 난방 대체는 **그 시간의 난방 수요만큼만**
// 가능하기 때문에 포화한다.
//
//   난방 수요  Q_heat(h) = max(0, UA × (목표실온 − 외기))        [kW]
//   LED 발열   Q_led     = 소비전력 × 발열비율                    [kW]
//   대체분     offset    = min(Q_led, Q_heat)                     ← 여기서 포화
//   잔여열     excess    = Q_led − offset                          ← 반드시 제거
//   순 열비용  = −offset × 난방단가 + excess × 제거단가
//
// 제거단가는 외기가 목표실온보다 낮으면 외기냉방(급배기 팬 전력)이라 싸고, 높으면
// 압축기 냉방이라 비싸다. 이 구조가 "추운 시간대 점등이 유리한 진짜 이유"다 —
// 난방 상쇄가 아니라 잔여열을 싸게 버릴 수 있기 때문이다. 우리 규모(LED 4~5kW,
// UA 0.03kW/K)에서 LED 발열은 난방 수요의 여러 배라, 겨울에도 재배실은 냉방 지배다.
//
// 이 함수 하나로 모든 계층(열통합·백테스트·통합최적화)이 같은 물리를 쓴다. 이전에는
// 계층마다 이진식·선형식이 따로 있어, 겨울에는 열 항이 상수가 되어 배치를 전혀
// 가르지 못하면서도 "추운 시간대 점등이 유리"라고 서술했다.
export function ledThermalCostPerHour(opts: {
  ledPowerKw: number;
  externalTempC: number;
  targetTempC?: number;
  uaKwPerK?: number;
  heatFraction?: number;
  heatCreditPerKwh?: number;
  coolCostPerKwh?: number;
  freeCoolingCostPerKwh?: number;
}): number {
  const target = opts.targetTempC ?? PARAMS.targetRoomTempC.value;
  const ua = opts.uaKwPerK ?? PARAMS.envelopeUaKwPerK.value;
  const heatFraction = opts.heatFraction ?? PARAMS.ledHeatFraction.value;
  const heatCredit = opts.heatCreditPerKwh ?? PARAMS.heatCreditPerKwh.value;
  const coolCost = opts.coolCostPerKwh ?? PARAMS.coolCostPerKwh.value;
  const freeCool = opts.freeCoolingCostPerKwh ?? PARAMS.freeCoolingCostPerKwh.value;

  const ledHeat = opts.ledPowerKw * heatFraction;
  const heatDemand = Math.max(0, ua * (target - opts.externalTempC));
  const offset = Math.min(ledHeat, heatDemand);
  const excess = ledHeat - offset;
  // 외기가 목표실온보다 낮으면 잔여열은 외기냉방으로 버린다. 높으면 압축기를 쓰는데,
  // 응축온도가 올라 같은 열을 빼는 비용이 외기와 함께 오른다 — 이 의존성이 없으면
  // 여름철 시간대별 비용이 평탄해져 배치를 가르지 못한다.
  const overshoot = Math.max(0, opts.externalTempC - target);
  const removalRate =
    overshoot > 0
      ? coolCost * (1 + PARAMS.coolCopDegradationPerK.value * overshoot)
      : freeCool;
  return -offset * heatCredit + excess * removalRate;
}

// ── ①-DLI: 일적산광량 기반 광주기 최적화 (농학적으로 옳은 제어) ───────────
// "14시간 점등"이 아니라 "목표 DLI를 충족하는 최소 요금 배치"를 푼다. 생육을 총 광량으로
// 대표하고 그것을 하드 제약으로 보존하는 것이 전력 절감의 농학적 정당화다
// (Economic MPC, arXiv 2410.23793).
//
// **이것은 검증된 사실이 아니라 이 엔진 전체가 기대고 있는 가정이다.** 같은 DLI라도
// 광질·순간 PPFD·시각 분포에 따라 수율이 달라진다는 보고가 있다 — 동일 DLI에서 명암
// 주기만 24h→27h로 바꿔 바이오매스가 11~29% 늘어난 사례가 그렇다. 시간 압축으로 PPFD를
// 올리는 것(resolveLighting)도 여기서는 등가로 취급하지만, 고PPFD·단시간이 저PPFD·장시간과
// 같은지는 광포화·광저해 때문에 자명하지 않다.
// 수율모델 y(DLI)가 DLI만의 함수라 배치의 영향을 담을 자리가 없으므로, 배치를 옮겨 잃는
// 수율이 있다면 이 리포트의 절감액은 그만큼 과대평가다. 그 크기는 같은 사이트에서
// DLI를 고정한 채 배치만 바꿔 보는 실험 없이는 알 수 없다.
//
// 배치는 연속 블록만 허용한다. 총 광량이 같아도 빛을 싼 시간마다 흩뿌리면 암기가
// 조각나 생체리듬이 깨지고, 명기 자체도 하루 끝까지 늘어나 추대 위험이 생긴다.
// 연속 블록이면 암기는 자동으로 (24 − 명기)만큼 한 덩어리로 확보된다 — 이 제약이
// 위 가정의 위험을 줄이는 장치다(배치 자유도를 스스로 좁혀 둔다).
export interface DliPlan {
  cropLabel: string;
  dliTarget: number;
  requiredHours: number; // 목표 DLI 충족에 필요한 명기
  achievedDli: number;
  ppfdUsed: number; // 시간 압축으로 상향된 실제 PPFD
  ledPowerKwUsed: number; // 그에 따라 오른 소비전력
  darkContinuousH: number;
  photoperiodSafe: boolean;
  feasible: boolean; // 정격 PPFD 안에서 달성 가능한가 (아니면 광량 재설계 필요)
  litHours: number[]; // 점등 시간대 (연속 블록, 원형 24h)
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
  const light = resolveLighting({
    cropKey: opts.cropKey,
    dliTarget,
    ledPowerKw: opts.ledPowerKw,
    ppfd: opts.ppfd,
  });
  const kw = light.ledPowerKw;

  // 연속 블록의 시작시각 24개를 전수 탐색해 최저 요금 배치를 고른다.
  const blockCostAt = (start: number) => {
    let c = 0;
    for (let i = 0; i < light.hours; i++) c += kw * tariff[(start + i) % 24];
    return c;
  };
  let bestStart = 0;
  let costPerDay = Infinity;
  for (let s = 0; s < 24; s++) {
    const c = blockCostAt(s);
    if (c < costPerDay) {
      costPerDay = c;
      bestStart = s;
    }
  }
  const litHours = Array.from({ length: light.hours }, (_, i) => (bestStart + i) % 24);

  // 관행: 08시부터 연속 점등
  const naive = Array.from({ length: light.hours }, (_, i) => (8 + i) % 24);
  const naiveCostPerDay = naive.reduce((s, h) => s + kw * tariff[h], 0);

  const savingPerDay = naiveCostPerDay - costPerDay;
  // CO2: kWh는 같지만(같은 시간 켬) 저탄소 시간대로 옮기면 배출이 준다.
  // 시간대 배출 = kWh × 평균배출계수 × 시간대 배율.
  const co2Of = (hours: number[]) =>
    hours.reduce(
      (s, h) => s + kw * GRID_EMISSION_FACTOR * CARBON_INTENSITY_FACTOR[h],
      0
    );
  const co2SavedKgPerMonth =
    Math.round((co2Of(naive) - co2Of(litHours)) * 30 * 10) / 10;
  return {
    cropLabel: crop.label,
    dliTarget,
    requiredHours: light.hours,
    achievedDli: light.achievedDli,
    ppfdUsed: light.ppfd,
    ledPowerKwUsed: Math.round(kw * 100) / 100,
    darkContinuousH: light.darkH,
    photoperiodSafe: light.photoperiodSafe,
    feasible: light.feasible,
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
  /** 실제 운전 중인 목표 DLI. 스케줄이 목표를 상향/하향했으면 그 값을 넘긴다 */
  dliTarget?: number;
}): DliFeedback {
  const crop = getCrop(opts.cropKey);
  const target = opts.dliTarget ?? crop.dliTarget;
  // lux → PPFD 근사(백색 LED ~0.015 μmol/m²/s per lux), 시간당 적산
  const dliPerLuxHour = (0.015 * 3600) / 1e6;
  const realizedDli =
    Math.round(opts.recentLux.reduce((s, l) => s + l * dliPerLuxHour, 0) * 10) /
    10;
  const gapPct = Math.round(((realizedDli - target) / target) * 1000) / 10;
  let action: string;
  if (gapPct < -10) action = `목표 대비 ${gapPct}% 부족 — 익일 광시간/광량 상향`;
  else if (gapPct > 10) action = `목표 대비 +${gapPct}% 초과 — 익일 광량 하향(전력 절감)`;
  else action = `목표 근접(${gapPct}%) — 현 스케줄 유지`;
  return { realizedDli, targetDli: target, gapPct, action };
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
  status: "ok" | "adjust" | "unavailable";
  message: string;
}

// 양액 pH 프로브의 물리적 신뢰 구간. 수경 양액은 산·염기로 보정하더라도 이 밖으로
// 나가지 않는다. 벗어난 값은 양액 이상이 아니라 센서·단위 불일치로 보는 게 맞다
// (예: 토양 pH 프로브, 또는 0~2 스케일로 보고하는 장비). 그런 값에 보정제 투입을
// 권고하면 데이터가 바뀌기 전까지 매번 같은 경보가 뜬다.
const PH_SENSOR_PLAUSIBLE: [number, number] = [3.5, 9.5];

export function nutrientAdvice(latest: IoTReading, cropKey?: string): NutrientAdvice {
  const [lo, hi] = getCrop(cropKey).healthyRanges.phLevel;
  if (
    latest.phLevel < PH_SENSOR_PLAUSIBLE[0] ||
    latest.phLevel > PH_SENSOR_PLAUSIBLE[1]
  ) {
    return {
      status: "unavailable",
      message: `양액 pH ${latest.phLevel.toFixed(2)} — 수경 양액 범위 밖. 센서·단위 불일치로 보고 판정 보류`,
    };
  }
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
  status: "ok" | "insufficient-data" | "degenerate-scale";
}

// ── 로버스트 산포 추정 (양자화 센서 방어) ──────────────────────────────────
// MAD(중앙절대편차 × 1.4826)는 드리프트 구간이 섞여 있어도 강건하다. 다만 값이 굵게
// 양자화된 센서(예: 0.17 단위로만 보고하는 pH 프로브)는 MAD가 0이거나 양자화 계단보다
// 작아진다. 그 값을 그대로 분모에 쓰면 Z가 발산해 관리도가 천문학적 통계량을 내고,
// 0을 작은 상수로 덮으면 없는 신호가 있는 것처럼 보인다. 산포가 양자화 계단에
// 못 미치면 "판정 불가"로 돌려보내는 편이 정직하다.
function robustScale(values: number[]): {
  center: number;
  scale: number;
  degenerate: boolean;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const center = sorted[Math.floor(sorted.length / 2)];
  const absDev = values.map((v) => Math.abs(v - center)).sort((a, b) => a - b);
  const scale = 1.4826 * absDev[Math.floor(absDev.length / 2)];
  // 양자화 계단 = 서로 다른 인접 관측값 사이의 최소 간격
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0 && d < step) step = d;
  }
  return {
    center,
    scale,
    degenerate: !(scale > 0) || (Number.isFinite(step) && scale < step),
  };
}

// 온실 데이터는 주야 사이클(계절성)이 강해 원시값에 CUSUM을 걸면 사이클
// 자체를 드리프트로 오탐한다. 24시간 차분(x[i] − x[i−lag])으로
// 계절성을 제거한 뒤 관리도를 적용한다 — lag는 "24시간에 해당하는 표본 수"이므로
// 표본 주기에 맞춰 넘긴다(시간당 24, 30분당 48). 정상이면 차분이 0 근방, 열화면
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

// ── 관리한계 ─────────────────────────────────────────────────────────────────
// 고정 H=5는 짧은 계열에만 맞다. K=0.5·H=5의 관리상태 평균런길이(ARL₀)가 약 465표본
// 이므로 그보다 긴 창을 훑으면 드리프트가 없어도 오경보가 사실상 확정된다. 그렇다고
// Siegmund 근사
//   ARL₀ ≈ (exp(2K(H+1.166)) − 2K(H+1.166) − 1) / (2K²)
// 로 길이만 보정해도 부족하다 — 그 근사는 i.i.d. 정규를 전제하는데 실제 센서 계열은
// 자기상관과 두꺼운 꼬리를 갖고 있어, 실측 오경보율이 이론값보다 훨씬 느리게 떨어진다.
//
// 그래서 한계는 이 계열 자신의 **관리상태 표본**에서 부트스트랩으로 잡는다. 관리도
// Phase I의 표준 절차 그대로다 — 관리이탈로 보이는 점을 먼저 걸러내 관리상태 표본을
// 만들고, 그 산포를 재표집해 "관리상태에서 이 길이를 감시할 때 나올 수 있는 최대
// 누적량"의 분포를 얻은 뒤 상위 분위수를 한계로 쓴다. 자기상관·두꺼운 꼬리에 자동
// 적응한다.
//
// 걸러내는 단계가 핵심이다. 계열을 통째로 재표집하면 드리프트 구간의 값이 귀무분포에
// 섞여 한계를 자기 신호만큼 밀어올린다 — 드리프트가 클수록 못 잡는 자기무력화가 된다.
// 앞 1/4만 기준으로 삼는 것도 부족하다. 드리프트가 그 안에서 시작하면 기준이 오염된다.
const NULL_ITERATIONS = 400;
const NULL_ALPHA = 0.005; // 센서당 — 4센서 동시검정에서 화면 기준 ~2%
const IN_CONTROL_Z = 3; // 이보다 큰 |z|는 관리이탈로 보고 귀무표본에서 제외

function maxCusumStat(z: number[], from: number, k: number): number {
  let cPos = 0;
  let cNeg = 0;
  let max = 0;
  for (let i = from; i < z.length; i++) {
    cPos = Math.max(0, cPos + z[i] - k);
    cNeg = Math.max(0, cNeg - z[i] - k);
    const stat = Math.max(cPos, cNeg);
    if (stat > max) max = stat;
  }
  return max;
}

/** 관리상태 표본 부트스트랩 귀무분포의 (1−alpha) 분위수. */
function bootstrapLimit(
  zs: number[],
  monitoredLength: number,
  k: number,
  seed: number
): number {
  // 관리이탈점 제외. 절반 넘게 걸러지면 "이탈이 예외"라는 전제가 깨진 것이므로
  // 거르지 않고 전체를 쓴다 — 남은 소수를 정상으로 삼으면 기준이 뒤집힌다.
  const screened = zs.filter((z) => Math.abs(z) <= IN_CONTROL_Z);
  const baseline = screened.length >= zs.length / 2 ? screened : zs;
  const rand = mulberry32(seed);
  const nulls: number[] = [];
  const draw = new Array(monitoredLength);
  for (let b = 0; b < NULL_ITERATIONS; b++) {
    for (let i = 0; i < monitoredLength; i++) {
      draw[i] = baseline[Math.floor(rand() * baseline.length)];
    }
    nulls.push(maxCusumStat(draw, 0, k));
  }
  nulls.sort((a, b) => a - b);
  const idx = Math.min(
    nulls.length - 1,
    Math.ceil((1 - NULL_ALPHA) * nulls.length) - 1
  );
  return nulls[idx];
}

export function cusumDrift(
  readings: IoTReading[],
  opts?: { lag?: number; h?: number; calibrate?: boolean }
): CusumResult[] {
  const K = 0.5;
  const H = opts?.h ?? 5;
  // 순열 보정은 계열이 충분히 길 때만 의미가 있다 — 짧으면 섞을 순서가 없다.
  const calibrate = opts?.calibrate ?? false;
  const lag = opts?.lag ?? 24; // 기본: 시간당 표본
  const sensors = CUSUM_SENSORS;

  return sensors.map((key): CusumResult => {
    if (readings.length < lag + 12) {
      return {
        sensor: key,
        detected: false,
        detectedIndex: null,
        maxStatistic: 0,
        status: "insufficient-data",
      };
    }
    // 계절 차분 시계열. lag=0은 "차분하지 않음" — 이미 한 주기를 평균낸 계열(일평균
    // 등)에는 계절 성분이 없으므로 차분이 해롭기만 하다. 차분은 저주파 흔들림을
    // lag 길이의 동일부호 런으로 바꾸는데(acf(lag) ≈ −0.5), 그 런이 바로 관리도가
    // 잡도록 설계된 패턴이라 정상 계열에서도 통계량이 쌓인다.
    const diffs: number[] =
      lag <= 0
        ? readings.map((r) => r[key])
        : readings.slice(lag).map((r, i) => r[key] - readings[i][key]);
    // 산포 추정: 주야간 노이즈 크기가 달라(이분산) 특정 구간만으로 σ를 잡으면
    // 오탐한다. 전체 차분의 로버스트 산포를 쓴다.
    const { center, scale, degenerate } = robustScale(diffs);
    if (degenerate) {
      return {
        sensor: key,
        detected: false,
        detectedIndex: null,
        maxStatistic: 0,
        status: "degenerate-scale",
      };
    }
    const baseN = Math.max(8, Math.floor(diffs.length / 4));
    const zs = diffs.map((d) => (d - center) / scale);

    // 한계: 보정을 쓰면 기준기간 부트스트랩에서, 아니면 고정/주입된 H를 쓴다.
    // 시드는 센서마다 다르되 고정 — 같은 입력이면 항상 같은 판정이 나와야 한다.
    const limit = calibrate
      ? Math.max(
          H,
          bootstrapLimit(
            zs,
            zs.length - baseN,
            K,
            0x5eed + key.length * 7919
          )
        )
      : H;

    let cPos = 0;
    let cNeg = 0;
    let maxStat = 0;
    let detectedIndex: number | null = null;
    for (let i = baseN; i < zs.length; i++) {
      const z = zs[i];
      cPos = Math.max(0, cPos + z - K);
      cNeg = Math.max(0, cNeg - z - K);
      const stat = Math.max(cPos, cNeg);
      if (stat > maxStat) maxStat = stat;
      if (stat > limit && detectedIndex === null) detectedIndex = i + lag; // 원본 인덱스로 환산
    }
    return {
      sensor: key,
      detected: detectedIndex !== null,
      detectedIndex,
      maxStatistic: Math.round(maxStat * 10) / 10,
      status: "ok",
    };
  });
}

// ── ⑧ 외부기상 차분 CUSUM: 계절변화 상쇄, 설비열화만 탐지 ──────────────────
// 온실 내부온도는 외부기온을 따라간다 — 원시 CUSUM은 계절 하강을 설비 드리프트로
// 오탐한다(실데이터에서 실제로 관측됨). 내부-외부 온도차(differential)에 관리도를
// 걸면 계절 성분이 상쇄되고, 히터·차광·단열 성능 저하만 차분의 이동으로 남는다.
// (RL-Guided MPC의 외란 보상 원리, arXiv 2506.13278 — 여기선 통계적 차분으로 경량 구현.)
// 이 관리도는 외기 시계열이 내부와 **독립적으로 실측된 것**일 때만 의미가 있다.
// 외기를 내부온도에서 상수를 빼 만들면 차분이 상수가 되어 관리도가 영원히 "정상"만
// 낸다 — 판정하지 않는 것을 판정 결과로 오해하기 쉬운 실패 모드다. 그런 입력은
// degenerate-scale로 돌려보내고, 호출부가 "정상"이라 표시하지 못하게 한다.
export interface WeatherCompensatedResult {
  status: "ok" | "insufficient-data" | "degenerate-scale";
  detected: boolean;
  detectedIndex: number | null;
  maxStatistic: number;
  baselineDiff: number; // 정상 가동 시 내외기 온도차 중앙값
  usedFleetPrior: boolean;
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
      status: "insufficient-data",
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      baselineDiff: 0,
      usedFleetPrior: false,
      note: "데이터 부족 — 판정 보류 (최소 12건 필요)",
    };
  }
  const diff = Array.from({ length: n }, (_, i) => internal[i] - external[i]);
  const own = robustScale(diff);
  // 신규 사이트(자체 이력 부족)는 플릿 사전분포로 부트스트랩(teacher-student 콜드스타트).
  const useFleet = n < 48 && opts?.fleetPrior != null;
  // 산포가 아예 없으면 플릿 사전분포로도 판정할 수 없다. 차분이 상수인데 플릿의 중앙값을
  // 빼면 z가 0이 아닌 상수가 되어 누적합이 선형으로 쌓인다 — 판정 보류가 아니라 없는
  // 열화를 보고하게 된다. 표본이 짧아 산포 추정이 거친 경우(양자화 계단 미만)와 달리,
  // 산포가 0인 것은 외기가 내부값에서 파생됐다는 증거이므로 사전분포로 덮지 않는다.
  if (!(own.scale > 0)) {
    return {
      status: "degenerate-scale",
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      baselineDiff: Math.round(own.center * 10) / 10,
      usedFleetPrior: false,
      note: "내외기 차분에 산포가 전혀 없음 — 외기가 내부값에서 파생된 대체값. 독립 실측 외기 시계열이 있어야 판정 가능",
    };
  }
  if (!useFleet && own.degenerate) {
    return {
      status: "degenerate-scale",
      detected: false,
      detectedIndex: null,
      maxStatistic: 0,
      baselineDiff: Math.round(own.center * 10) / 10,
      usedFleetPrior: false,
      note: "내외기 차분에 산포가 없음 — 외기가 내부값에서 파생된 대체값일 가능성. 독립 실측 외기 시계열이 있어야 판정 가능",
    };
  }
  const center = useFleet ? opts!.fleetPrior!.median : own.center;
  const scale = useFleet ? opts!.fleetPrior!.mad : own.scale;

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
    status: "ok",
    detected: detectedIndex !== null,
    detectedIndex,
    maxStatistic: Math.round(maxStat * 10) / 10,
    baselineDiff: Math.round(center * 10) / 10,
    usedFleetPrior: useFleet,
    note:
      (useFleet ? "플릿 사전분포로 판정(자체 이력 축적 전 콜드스타트) — " : "") +
      (detectedIndex !== null
        ? "내외기 차분 이동 감지, 계절 아닌 설비 요인(단열/히터/차광) 점검"
        : "차분 안정, 설비 정상(계절 변화는 상쇄됨)"),
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

  // 반복마다 상태를 복제한다(3만 회). JSON 왕복은 이 구조에 과한 비용이라 필드 복사로.
  const cloneState = (s: State): State => ({
    ledSplit: s.ledSplit,
    ledS1: s.ledS1,
    ledS2: s.ledS2,
    flex: s.flex.map((h) => [...h]),
  });

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

  let cur: State = cloneState(init);
  let curCost = baselineCost;
  let best = cur;
  let bestCost = curCost;

  // 2블록 분할은 각 블록이 최소 MIN_BLOCK 시간이어야 성립한다. 명기가 그보다 짧으면
  // 분할 자체가 불가능하므로 해당 이동을 제안하지 않는다(제안해도 전부 기각된다).
  const MIN_BLOCK = 4;
  const canSplit = P >= 2 * MIN_BLOCK;

  for (let it = 0; it < iters; it++) {
    const temp = 1000 * (1 - it / iters) + 1;
    const next: State = cloneState(cur);
    const move = Math.floor(rand() * 3);
    if (move === 0) {
      next.ledS1 = Math.floor(rand() * 24);
    } else if (move === 1 && canSplit) {
      next.ledS2 = Math.floor(rand() * 24);
      next.ledSplit = MIN_BLOCK + Math.floor(rand() * (P - 2 * MIN_BLOCK + 1));
    } else if (move === 2 && opts.flexLoads.length > 0) {
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

// 상승분은 **양쪽 다 기대값**으로 비교한다. 밴딧의 노이즈 포함 실현합을 균등 배분의
// 무노이즈 기대값과 견주면 그 차이에 운이 섞여, 같은 알고리즘도 시드에 따라 상승분이
// 달라진다. 배분(nᵢ)이 결정되면 기대 마진은 Σ nᵢ·trueMeanᵢ로 확정된다.
export interface BanditAllocation {
  rounds: number;
  allocation: { name: string; trays: number; share: number; posteriorMean: number }[];
  banditTotalMargin: number; // 밴딧 배분의 기대 마진 합
  uniformTotalMargin: number; // 균등 배분의 기대 마진 합
  realizedTotalMargin: number; // 시뮬레이션에서 실제로 관측된 보상 합 (노이즈 포함)
  uplift: number;
  // trueMeanMargin은 실측 이전엔 가정값이다. 화면에 상승분을 띄울 때 근거가 실측인지
  // 시뮬레이션인지 구분하라고 호출부에 넘기는 표식.
  synthetic: boolean;
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

// 폐기 절감 1포기의 가치는 **판매가가 아니라 변동비**다. 안 심어서 아끼는 것은
// 종자·양액·전기·포장이지 매출이 아니며(애초에 안 팔릴 물량이다), 판매가로 세면
// 이 레버 하나가 전력 절감 전체를 몇 배로 압도해 리포트가 왜곡된다.
const UNIT_VARIABLE_COST = PARAMS.unitVariableCost.value;

export function operationsSavingsReport(opts: {
  dliSavingPerMonth: number; // 전력량요금 절감 (LED 시간 이동)
  peakSavingPerMonth: number; // 기본요금 절감 (피크 분산) — 서로 다른 요금 축이라 비중복
  saImprovementPerMonth: number; // SA 통합 최적화가 찾은 추가분
  wasteReductionUnits: number;
  unitVariableCost?: number; // 폐기 절감 1포기당 아끼는 변동비(원)
  dliCo2PerMonth: number;
  confidence?: "measured" | "projected";
}): OperationsSavings {
  const unitCost = opts.unitVariableCost ?? UNIT_VARIABLE_COST;
  const wasteWon = opts.wasteReductionUnits * unitCost;
  // 합산은 비중복 레버만: 전력량요금(DLI) + 기본요금(피크)은 요금 축이 달라 중복 없음.
  // SA는 이 둘을 동시에 푸는 전역탐색이라 LED 이동분이 DLI와 겹친다 → 합산 제외,
  // "통합 검증치"로만 표기(정직성).
  // 기본요금 레버는 최대수요전력 계량 대상일 때만 금액이 붙는다. 20kW 미만 저압
  // 사이트는 기본요금이 계약전력에 고정돼 0원이 들어오며, 그 사실이 화면에 남아야 한다.
  const breakdown = [
    { lever: "DLI 광주기(전력량요금)", wonPerMonth: opts.dliSavingPerMonth },
    {
      lever:
        opts.peakSavingPerMonth > 0
          ? "피크 분산(기본요금)"
          : "피크 분산(기본요금) — 20kW 미만이라 미실현",
      wonPerMonth: opts.peakSavingPerMonth,
    },
    { lever: "수요연동 파종(폐기 변동비)", wonPerMonth: wasteWon },
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
  synthetic?: boolean; // arms의 trueMeanMargin이 실측이면 false로 넘긴다
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

  // 기대 마진: 밴딧은 실제 배분 nᵢ로, 균등은 라운드를 팔 수만큼 고르게 나눠 계산.
  // 같은 기준(무노이즈 기대값)끼리 견주므로 상승분에 운이 섞이지 않는다.
  const banditExpected = opts.arms.reduce(
    (s, a, i) => s + stats[i].n * a.trueMeanMargin,
    0
  );
  const uniformExpected =
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
    banditTotalMargin: Math.round(banditExpected),
    uniformTotalMargin: Math.round(uniformExpected),
    realizedTotalMargin: Math.round(banditTotal),
    uplift: Math.round(banditExpected - uniformExpected),
    synthetic: opts.synthetic ?? true,
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
  /**
   * (피크 절감 kW) × 기본요금 단가. **최대수요전력 계량 대상일 때만 실현되는 금액**이라
   * 이름에 조건을 남긴다 — 계약전력 20kW 미만이면 기본요금이 계약전력에 붙어 피크를
   * 낮춰도 청구서가 그대로다. 실현 여부 판정은 optimalContractPower가 한다.
   */
  demandChargeSavingIfMeteredPerMonth: number;
}

const DEMAND_CHARGE_PER_KW = PARAMS.demandChargePerKw.value;

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
    demandChargeSavingIfMeteredPerMonth: Math.round(
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

// 사이트 간 품목 배분은 밴딧이 아니라 마코위츠 평균-분산으로 푼다
// (optimization-frontier.ts의 cropMeanVariance). 배분 결정은 리스크-수익 프론티어
// 위에서 내려야 하고, 답이 한 곳에서만 나와야 리포트가 서로 다른 배합을 권하지 않는다.
// 밴딧은 사이트 안에서의 품종·레시피 탐색(위 recipeOptimization)에 쓴다.
