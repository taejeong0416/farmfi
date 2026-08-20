// ── AI 운영 최적화 — 고도화 스택 (5개 돌파) ──────────────────────────────────
// 기본 엔진(optimization.ts)의 한계 4개를 뚫는다. 수직 조합:
//   광주기 안전(바닥 제약) → 빛-열-CO2 통합 → 확률적 강건 → 수율-이익 → 플릿 VPP(꼭대기)
// 각 단계가 다음의 입력이 된다: 광주기가 유연성의 상한을 정하고, 그 유연성을
// 이익 기준으로 값매기고, 불확실성에 강건화한 뒤, 플릿이 모아 전력망에 판다.

import { getCrop } from "./crop-profiles";
import {
  TARIFF_TOU_GENERAL,
  dliSchedule,
  resolveLighting,
  ledThermalCostPerHour,
} from "./optimization";
import { PARAMS } from "./optimization-params";
import { mulberry32, gaussFrom } from "./prng";

// LED 1kWh의 실효 단가. 스케줄이 정해졌으면 그 배치의 평균 단가(총비용 ÷ kWh)가
// 실효 단가다 — 24시간 평균은 싼 시간에 켜는 이득을 지운다. 스케줄이 없으면 요금표 평균.
export function effectiveUnitPrice(opts: {
  costPerDay: number;
  ledPowerKw: number;
  hours: number;
}): number | undefined {
  const kwh = opts.ledPowerKw * opts.hours;
  return kwh > 0 ? opts.costPerDay / kwh : undefined;
}

function meanTariff(tariff: number[]): number {
  return tariff.reduce((a, b) => a + b, 0) / tariff.length;
}

// ── 돌파 2: 광주기 안전 DLI (농학 하드 제약) ──────────────────────────────
// 총 광량만 맞추고 시간을 마음대로 흩뿌리면 상추는 낮 길이(광주기)가 길어져 추대로
// 상품가치를 잃고, 조각난 암기 때문에 생체리듬도 깨진다. 그래서 (a) 명기 ≤ 최대광주기,
// (b) 연속 암기 ≥ 최소암기 를 하드 제약으로 걸고 빛을 "연속 블록"으로만 배치한다.
// 제약과 배치는 dliSchedule이 이미 수행하므로 여기서는 그 해에 "안전을 위해 포기한
// 절감액"을 붙인다 — 산란 배치와의 차액이 제약의 가격표다.
export interface PhotoperiodSafePlan {
  cropLabel: string;
  requiredHours: number; // DLI 충족 명기 (PPFD 상향 반영)
  ppfdUsed: number;
  ledPowerKwUsed: number; // PPFD 상향으로 오른 소비전력
  litHours: number[]; // 연속 광 블록
  darkContinuousH: number; // 확보된 연속 암기
  safe: boolean; // 광주기 제약 충족
  feasible: boolean; // 정격 PPFD 안에서 달성 가능
  costPerDay: number;
  naiveScatterCostPerDay: number; // 산란(비안전) 배치 비용 — 비교용
  safetyCostPerDay: number; // 안전을 위해 포기한 절감액
  note: string;
}

export function photoperiodSafeDli(opts: {
  cropKey?: string;
  ledPowerKw: number;
  tariff?: number[];
  dliTarget?: number;
  ppfd?: number;
}): PhotoperiodSafePlan {
  const crop = getCrop(opts.cropKey);
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const plan = dliSchedule(opts);
  const kw = plan.ledPowerKwUsed;

  // 비교: 산란(가장 싼 시간 아무거나 — 비안전) 배치 비용
  const order = [...Array(24).keys()].sort((a, b) => tariff[a] - tariff[b]);
  const scatterCost = order
    .slice(0, plan.requiredHours)
    .reduce((s, h) => s + kw * tariff[h], 0);
  const safetyCost = plan.costPerDay - scatterCost;

  return {
    cropLabel: crop.label,
    requiredHours: plan.requiredHours,
    ppfdUsed: plan.ppfdUsed,
    ledPowerKwUsed: kw,
    litHours: plan.litHours,
    darkContinuousH: plan.darkContinuousH,
    safe: plan.photoperiodSafe,
    feasible: plan.feasible,
    costPerDay: plan.costPerDay,
    naiveScatterCostPerDay: Math.round(scatterCost),
    safetyCostPerDay: Math.round(safetyCost),
    note: !plan.feasible
      ? `제약 충족 불가 — PPFD ${plan.ppfdUsed}는 정격 상한 ${crop.maxPpfd} 초과. 시설 광량 재설계 필요`
      : plan.photoperiodSafe
        ? `연속 명기 ${plan.requiredHours}h + 연속 암기 ${plan.darkContinuousH}h 확보 (추대·생체리듬 안전). 안전 비용 +${Math.round(safetyCost)}원/일`
        : `연속 암기 ${plan.darkContinuousH}h — 최소 ${crop.minDarkH}h 미달. 목표 DLI 하향 또는 광량 증설 필요`,
  };
}

// ── 돌파 3: 빛-열-CO2 통합 최적화 ─────────────────────────────────────────
// LED는 전력의 대부분을 열로 낸다(밀폐 재배실). 겨울엔 그 열이 난방을 대체하고
// (크레딧), 여름엔 냉방 부하를 늘린다(페널티). 부하를 따로 풀지 않고 외부온도
// 연동으로 LED 배치의 순 열비용을 함께 계산한다. 계절에 따라 최적 배치가 뒤집힌다.
export interface ThermalCoupledPlan {
  season: "winter" | "summer" | "mild";
  litHours: number[];
  energyCostPerDay: number;
  netThermalCostPerDay: number; // 난방상쇄(음수)/냉방가산(양수)
  totalCostPerDay: number;
  vsEnergyOnlyPerDay: number; // 전력만 최적화한 대비 차이
  note: string;
}

export function thermalCoupledSchedule(opts: {
  cropKey?: string;
  ledPowerKw: number;
  requiredHours: number;
  hourlyExtTemp: number[]; // 24h 외부온도 ℃
  tariff?: number[];
  heatCoef?: number; // 난방 원/kWh열 (히트펌프 COP 반영 근사)
  coolCoef?: number; // 냉방 원/kWh열
}): ThermalCoupledPlan {
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const P = opts.requiredHours;
  const heatCoef = opts.heatCoef ?? PARAMS.heatCreditPerKwh.value;
  const coolCoef = opts.coolCoef ?? PARAMS.coolCostPerKwh.value;
  const avgExt = opts.hourlyExtTemp.reduce((a, b) => a + b, 0) / 24;
  const season = avgExt < 12 ? "winter" : avgExt > 24 ? "summer" : "mild";

  // 시간별 순비용(원/h) = 전력요금 + LED 발열의 순 열비용.
  // 열 항은 ledThermalCostPerHour 한 곳에서만 계산한다 — 백테스트·통합최적화가 같은
  // 물리를 쓰게 하려면 여기에 사본을 두지 않아야 한다. 난방 대체는 그 시간의 난방
  // 수요만큼만 가능해 포화하고, 남는 열은 외기 온도에 따라 싸게(외기냉방) 또는
  // 비싸게(압축기) 버린다.
  const hourNetCost = (h: number) =>
    opts.ledPowerKw * tariff[h] +
    ledThermalCostPerHour({
      ledPowerKw: opts.ledPowerKw,
      externalTempC: opts.hourlyExtTemp[h],
      heatCreditPerKwh: heatCoef,
      coolCostPerKwh: coolCoef,
    });

  // 통합비용 기준 연속 광블록 최적 배치
  let bestStart = 0;
  let bestCost = Infinity;
  for (let s = 0; s < 24; s++) {
    let c = 0;
    for (let i = 0; i < P; i++) c += hourNetCost((s + i) % 24);
    if (c < bestCost) {
      bestCost = c;
      bestStart = s;
    }
  }
  const litHours = Array.from({ length: P }, (_, i) => (bestStart + i) % 24);

  // 전력만 최적화한 배치와 비교
  let elecBestStart = 0;
  let elecBest = Infinity;
  for (let s = 0; s < 24; s++) {
    let c = 0;
    for (let i = 0; i < P; i++) c += opts.ledPowerKw * tariff[(s + i) % 24];
    if (c < elecBest) {
      elecBest = c;
      elecBestStart = s;
    }
  }
  const elecOnlyLit = Array.from({ length: P }, (_, i) => (elecBestStart + i) % 24);
  const elecOnlyTotal = elecOnlyLit.reduce((s, h) => s + hourNetCost(h), 0);

  const energyCost = litHours.reduce((s, h) => s + opts.ledPowerKw * tariff[h], 0);
  const netThermal = bestCost - energyCost;

  return {
    season,
    litHours,
    energyCostPerDay: Math.round(energyCost),
    netThermalCostPerDay: Math.round(netThermal),
    totalCostPerDay: Math.round(bestCost),
    vsEnergyOnlyPerDay: Math.round(elecOnlyTotal - bestCost),
    note: `${
      season === "winter" ? "겨울" : season === "summer" ? "여름" : "간절기"
    }: LED 발열 ${Math.round(opts.ledPowerKw * PARAMS.ledHeatFraction.value * 10) / 10}kW가 난방 수요(외피 UA ${
      PARAMS.envelopeUaKwPerK.value
    }kW/K)를 넘어 재배실은 냉방 지배다 — 난방 대체분은 그 시간의 난방 수요만큼만 인정되고 남는 열은 버려야 한다. 외기가 낮은 시간엔 그 잔여열을 외기냉방으로 싸게 버릴 수 있어 점등이 유리하고, 더운 시간엔 압축기로 빼야 해 불리하다. 전력만 최적화 대비 ${Math.round(
      elecOnlyTotal - bestCost
    )}원/일 개선.`,
  };
}

// ── 돌파 4: 확률적 강건 최적화 (SMP 실시간가격 대응) ──────────────────────
// 고정 TOU 한 장에 전부 거는 대신, 실시간 도매가격(SMP) 시나리오를 샘플링해
// 여러 미래에 강건한 스케줄을 고른다. 목적 = 기대비용 + λ·CVaR(최악 5% 평균).
export interface RobustPlan {
  scenarios: number;
  blockStartHour: number; // 강건 최적해가 고른 점등 시작시각 — 실제로 실행할 스케줄
  expectedCostPerDay: number;
  worstCasePerDay: number; // CVaR95
  cvar95: number;
  deterministicCostPerDay: number; // 단일 예측 최적화
  robustnessPremium: number; // 강건 스케줄이 기대비용에서 조금 손해보고 최악을 줄인 정도
  note: string;
}

export function robustSchedule(opts: {
  ledPowerKw: number;
  requiredHours: number;
  baseTariff?: number[];
  volatility?: number; // SMP 변동성 (0~1)
  scenarios?: number;
  lambda?: number; // CVaR 가중
  seed?: number;
}): RobustPlan {
  const base = opts.baseTariff ?? TARIFF_TOU_GENERAL;
  const rand = mulberry32(opts.seed ?? 42);
  const gauss = gaussFrom(rand);
  const N = opts.scenarios ?? 200;
  const vol = opts.volatility ?? 0.35;
  const P = opts.requiredHours;
  const lambda = opts.lambda ?? 0.5;

  // 시나리오 생성: 각 시간대 가격에 곱셈 노이즈 (피크 시간 변동 더 큼)
  const scenarioTariffs: number[][] = [];
  for (let n = 0; n < N; n++) {
    scenarioTariffs.push(
      base.map((p, h) => {
        const hourVol = vol * (base[h] > 180 ? 1.5 : 1); // 피크 변동 확대
        return Math.max(30, p * (1 + gauss() * hourVol));
      })
    );
  }

  // 후보 스케줄 = 연속 광블록 24개. 각 후보의 시나리오별 비용 분포 평가.
  const evalBlock = (start: number, tariff: number[]) => {
    let c = 0;
    for (let i = 0; i < P; i++) c += opts.ledPowerKw * tariff[(start + i) % 24];
    return c;
  };

  let bestStart = 0;
  let bestObj = Infinity;
  let bestExpected = 0;
  let bestCvar = 0;
  for (let s = 0; s < 24; s++) {
    const costs = scenarioTariffs.map((t) => evalBlock(s, t)).sort((a, b) => a - b);
    const expected = costs.reduce((a, b) => a + b, 0) / N;
    const cvarSlice = costs.slice(Math.floor(N * 0.95));
    const cvar = cvarSlice.reduce((a, b) => a + b, 0) / cvarSlice.length;
    const obj = expected + lambda * cvar;
    if (obj < bestObj) {
      bestObj = obj;
      bestStart = s;
      bestExpected = expected;
      bestCvar = cvar;
    }
  }

  // 결정론적(기저 TOU 단일) 최적 — 비교용
  let detBest = Infinity;
  for (let s = 0; s < 24; s++) {
    const c = evalBlock(s, base);
    if (c < detBest) detBest = c;
  }

  return {
    scenarios: N,
    blockStartHour: bestStart,
    expectedCostPerDay: Math.round(bestExpected),
    worstCasePerDay: Math.round(bestCvar),
    cvar95: Math.round(bestCvar),
    deterministicCostPerDay: Math.round(detBest),
    robustnessPremium: Math.round(bestExpected - detBest),
    note: `SMP ${N}시나리오(변동성 ${Math.round(vol * 100)}%): 강건 스케줄이 최악 5%(CVaR)를 ${Math.round(
      bestCvar
    )}원으로 방어. 실시간요금제 전환 선대응.`,
  };
}

// ── 돌파 5: 수율-이익 최적화 (진짜 Economic MPC) ──────────────────────────
// 비용 최소가 아니라 이익(수율×가격 − 비용) 최대. 포화형 수율모델
// y(DLI) = ymax·(1 − e^(−k·DLI))로 "빛 더 줘서 얻는 수율 증가"와 "그 전기비"를
// 저울질한다. 채소값이 비싸면 광량을 늘리고, 싸면 줄이는 게 최적.
// 단, 이익이 크다고 아무 DLI나 고를 수는 없다. 광량은 명기 × PPFD로만 만들어지고
// 둘 다 상한(최대광주기·LED 정격)이 있으므로, 그 상한을 넘는 DLI는 후보에서 뺀다 —
// 이 게이트가 없으면 광주기 안전(돌파 2)이 금지한 명기를 이익최적화가 되살린다.
export interface ProfitPlan {
  profitMaxDli: number;
  costMinDli: number; // 기본(작물 목표 DLI)
  maxFeasibleDli: number; // 정격 PPFD × 최대광주기로 만들 수 있는 최대 DLI
  profitAtOptimum: number; // 원/일/㎡
  profitAtTarget: number;
  upliftPerDay: number;
  frontier: { dli: number; yield: number; cost: number; profit: number }[];
  note: string;
}

export function profitOptimization(opts: {
  cropKey?: string;
  ledPowerKw: number;
  areaM2?: number;
  cropPricePerKg?: number; // 산지가
  yieldMaxKgM2?: number; // 포화 수율
  yieldK?: number; // 포화 속도
  /**
   * LED 1kWh의 실효 단가(원). 광량을 늘릴지는 "추가 전기비 대 추가 수율"의 비교이므로
   * 이 단가가 결정적이다 — 계약종이 바뀌면(농사용 53원) 최적 DLI도 바뀐다.
   * 생략하면 기저 TOU의 24시간 평균을 쓴다.
   */
  avgTariff?: number;
}): ProfitPlan {
  const crop = getCrop(opts.cropKey);
  const area = opts.areaM2 ?? PARAMS.growRoomAreaM2.value;
  const price = opts.cropPricePerKg ?? PARAMS.cropPricePerKg.value;
  const ymax = opts.yieldMaxKgM2 ?? PARAMS.yieldMaxKgM2.value;
  const k = opts.yieldK ?? PARAMS.yieldLightK.value;
  const avgTariff = opts.avgTariff ?? meanTariff(TARIFF_TOU_GENERAL);

  const yieldOf = (dli: number) => ymax * (1 - Math.exp(-k * dli));
  // 광주기·정격 상한을 넘겨야만 만들어지는 DLI는 후보에서 제외(null).
  const costOf = (dli: number): number | null => {
    const light = resolveLighting({
      cropKey: opts.cropKey,
      dliTarget: dli,
      ledPowerKw: opts.ledPowerKw,
    });
    if (!light.feasible || !light.photoperiodSafe) return null;
    return light.ledPowerKw * light.hours * avgTariff; // 원/일 (사이트 전체 LED)
  };
  // 이익 = 수율가치(원/일 환산) − 전기비. 수율은 사이클(cycleDays)에 걸쳐 실현 → 일 환산.
  const profitOf = (dli: number): number | null => {
    const cost = costOf(dli);
    if (cost === null) return null;
    return (yieldOf(dli) * area * price) / crop.cycleDays - cost;
  };
  const maxFeasibleDli =
    Math.floor(((crop.maxPpfd * 3600) / 1e6) * crop.maxPhotoperiodH * 10) / 10;

  const frontier: ProfitPlan["frontier"] = [];
  let bestDli = crop.dliTarget;
  let bestProfit = -Infinity;
  for (let dli = 4; dli <= 30; dli += 1) {
    const cost = costOf(dli);
    if (cost === null) continue;
    const p = profitOf(dli)!;
    frontier.push({
      dli,
      yield: Math.round(yieldOf(dli) * 100) / 100,
      cost: Math.round(cost),
      profit: Math.round(p),
    });
    if (p > bestProfit) {
      bestProfit = p;
      bestDli = dli;
    }
  }
  const profitAtTarget = profitOf(crop.dliTarget);

  return {
    profitMaxDli: bestDli,
    costMinDli: crop.dliTarget,
    maxFeasibleDli,
    profitAtOptimum: Math.round(bestProfit),
    profitAtTarget: profitAtTarget === null ? 0 : Math.round(profitAtTarget),
    upliftPerDay:
      profitAtTarget === null ? 0 : Math.round(bestProfit - profitAtTarget),
    frontier: frontier.filter((f) => f.dli % 2 === 0),
    note:
      bestDli > crop.dliTarget
        ? `채소값 ${price}원/kg에선 목표 DLI ${crop.dliTarget}→${bestDli}로 광량 상향이 이익 최대(수율 증가 > 전기비). 일 +${Math.round(
            bestProfit - (profitAtTarget ?? 0)
          )}원. 광주기·정격 상한이 허용하는 최대 DLI는 ${maxFeasibleDli}`
        : `채소값 낮음 → DLI ${bestDli}로 광량 절감이 이익 최대(전기비 > 수율 증가)`,
  };
}

// ── 돌파 1: 플릿 가상발전소(VPP) 수요반응 ─────────────────────────────────
// 사이트마다 "광주기 안전 범위 안에서 미룰 수 있는 LED 부하"가 있다. 이 유연성을
// 플릿으로 묶으면 하나의 조절 가능한 발전소가 된다. 전력망이 급할 때(피크·경보)
// 부하를 줄이면 한국 수요반응(DR) 시장이 정산금을 준다 — 절감이 아니라 매출.
// 이 매출이 FarmFi 수수료 풀에 합류해 투자자 배당 재원이 된다.
export interface VppPlan {
  sites: number;
  contractedKw: number; // 계약감축량 (플릿 총 유연성)
  reductionHoursPerYear: number;
  basicSettlementPerYear: number; // 기본정산금 (대기 대가)
  performanceSettlementPerYear: number; // 실적정산금 (실제 감축)
  annualDrRevenue: number; // 플릿 전체 연 매출
  dividendContributionPerYear: number; // 플릿 전체 회수 재원 기여 (60%)
  annualDrRevenuePerSite: number; // 사이트당 연 매출 (= annualDrRevenue / sites)
  dividendPerSitePerYear: number; // 사이트당 회수 재원 기여 (= dividendContributionPerYear / sites)
  note: string;
}

// 한국 수요반응(DR/전력중개) 실제 정산 공식:
//  ① 기본정산금 = 계약감축량(kW) × 43,994원/kW·년 (전력거래소 공시 단가, 2017 기준)
//  ② 실적정산금 = 계약감축량(kW) × 100원/kWh × 총감축시간(hr/년)
// 수익의 대부분은 기본정산금(대기 대가) — 이벤트가 드물어도 대기만으로 지급된다.
export function fleetVPP(opts: {
  sites: number;
  ledPowerKw?: number;
  photoperiodFlexHours?: number;
  basicPricePerKwYear?: number; // 기본정산 단가 ₩/kW·년
  performancePricePerKwh?: number; // 실적정산 단가 ₩/kWh
  drEventsPerMonth?: number;
  drEventHours?: number;
  dividendShare?: number;
}): VppPlan {
  const ledKw = opts.ledPowerKw ?? 4;
  const flexH = opts.photoperiodFlexHours ?? 3;
  // 계약감축량 = 사이트당 LED 전량 (이벤트 시 끄고 광주기 안전범위 내 보광)
  // 단, 끈 시간을 되메울 여유가 없으면 감축 자체를 약속할 수 없다. 광주기 안전
  // 범위를 넘겨 보광하면 DLI를 지키려다 추대를 부르므로, 감축 시간은 암기 여유가
  // 상한이고 여유가 0이면 이 사이트는 DR에 참여할 수 없다.
  const contractedKw = flexH > 0 ? ledKw * opts.sites : 0;

  const basicPrice = opts.basicPricePerKwYear ?? PARAMS.drBasicPricePerKwYear.value;
  const perfPrice = opts.performancePricePerKwh ?? PARAMS.drPerformancePricePerKwh.value;
  const events = opts.drEventsPerMonth ?? 4;
  const eventH = Math.min(opts.drEventHours ?? 2, flexH);
  const reductionHoursPerYear = events * eventH * 12;

  const basic = contractedKw * basicPrice;
  const performance = contractedKw * perfPrice * reductionHoursPerYear;
  const total = basic + performance;
  const share = opts.dividendShare ?? 0.6;

  const totalRounded = Math.round(total);
  const dividendRounded = Math.round(total * share);
  return {
    sites: opts.sites,
    contractedKw: Math.round(contractedKw),
    reductionHoursPerYear,
    basicSettlementPerYear: Math.round(basic),
    performanceSettlementPerYear: Math.round(performance),
    annualDrRevenue: totalRounded,
    dividendContributionPerYear: dividendRounded,
    annualDrRevenuePerSite: Math.round(totalRounded / opts.sites),
    dividendPerSitePerYear: Math.round(dividendRounded / opts.sites),
    note:
      flexH <= 0
        ? `암기 여유가 없어(연속 암기가 최소 요구치와 같음) 감축을 약속할 수 없다 — 이 운전점에서는 DR 참여 불가. 목표 DLI를 낮추거나 광량을 늘려 명기를 줄이면 유연성이 생긴다.`
        : `플릿 ${opts.sites}개 사이트 총 ${Math.round(
            total / 10000
          )}만원/년 DR 매출(기본정산 ${Math.round(basic / 10000)}만 + 실적정산 ${Math.round(
            performance / 10000
          )}만, 연 ${reductionHoursPerYear}h 감축) → 회수 재원 플릿 총 ${Math.round(
            (total * share) / 10000
          )}만원/년 = 사이트당 ${Math.round((total * share) / opts.sites / 10000 * 10) / 10}만원/년. 규모에 비례 — ${opts.sites * 10}사이트면 ${Math.round((total * share) * 10 / 10000)}만원대. 광주기 유연성 ${flexH}h 안에서 회당 ${eventH}h 감축, 절감이 아니라 새 수익원.`,
  };
}

// ── 통합 스택: 5개 돌파의 최적 조합 ───────────────────────────────────────
// 수직 조합 — 각 단계가 다음의 입력이 된다:
//   ① 광주기 안전이 "이동 가능 유연성의 상한"을 정한다
//   ② 그 안에서 빛-열 통합으로 계절 최적 배치
//   ③ 가격 불확실성에 강건화
//   ④ 수율-이익으로 광량(DLI) 자체를 최적화
//   ⑤ 사이트들의 남은 유연성을 플릿 VPP로 모아 전력망에 판다
export interface OptimalStack {
  photoperiod: PhotoperiodSafePlan;
  thermal: ThermalCoupledPlan;
  robust: RobustPlan;
  profit: ProfitPlan;
  vpp: VppPlan;
  summary: {
    perSiteDailyCost: number; // 통합 일 비용 (전력+순열, 강건)
    perSiteProfitUpliftPerDay: number; // 수율-이익 최적화 상방
    fleetVppAnnualRevenue: number;
    fleetVppDividendPerYear: number;
    headline: string;
  };
}

export function optimalStack(opts: {
  cropKey?: string;
  ledPowerKw: number;
  sites: number;
  hourlyExtTemp: number[]; // 24h
  cropPricePerKg?: number;
  tariff?: number[];
}): OptimalStack {
  // ① 광주기 안전 (바닥 제약)
  const photoperiod = photoperiodSafeDli({
    cropKey: opts.cropKey,
    ledPowerKw: opts.ledPowerKw,
    tariff: opts.tariff,
  });
  // 아래 단계는 모두 ①이 확정한 운전점(압축된 PPFD에서의 소비전력)을 쓴다.
  // 설계값을 그대로 넘기면 시간 압축의 전력 증가가 비용에서 빠진다.
  const ledPowerKw = photoperiod.ledPowerKwUsed;
  // ② 빛-열 통합 (안전 명기 시간을 계절 최적 배치)
  const thermal = thermalCoupledSchedule({
    cropKey: opts.cropKey,
    ledPowerKw,
    requiredHours: photoperiod.requiredHours,
    hourlyExtTemp: opts.hourlyExtTemp,
    tariff: opts.tariff,
  });
  // ③ 강건 (가격 불확실성)
  const robust = robustSchedule({
    ledPowerKw,
    requiredHours: photoperiod.requiredHours,
    baseTariff: opts.tariff,
  });
  // ④ 수율-이익 (광량 자체 최적화). 광량 증설 판단은 실효 전기 단가에 달려 있으므로
  // ①이 고른 배치의 단가를 넘긴다 — 요금표 평균을 쓰면 계약종을 바꿔도 답이 안 바뀐다.
  const profit = profitOptimization({
    cropKey: opts.cropKey,
    ledPowerKw: opts.ledPowerKw,
    cropPricePerKg: opts.cropPricePerKg,
    avgTariff: effectiveUnitPrice({
      costPerDay: photoperiod.costPerDay,
      ledPowerKw,
      hours: photoperiod.requiredHours,
    }),
  });
  // ⑤ 플릿 VPP (광주기 안전 내 남은 유연성을 판다)
  // 팔 수 있는 유연성 = 명기를 앞뒤로 밀 수 있는 폭. 연속 암기가 최소 요구치보다
  // 긴 만큼만 블록을 옮길 수 있고, 그 여유가 곧 DR 이벤트에 응답 가능한 시간이다.
  const crop = getCrop(opts.cropKey);
  const flexHours = Math.max(0, photoperiod.darkContinuousH - crop.minDarkH);
  const vpp = fleetVPP({
    sites: opts.sites,
    ledPowerKw,
    photoperiodFlexHours: flexHours,
  });

  const perSiteDailyCost = thermal.totalCostPerDay + robust.robustnessPremium;
  return {
    photoperiod,
    thermal,
    robust,
    profit,
    vpp,
    summary: {
      perSiteDailyCost: Math.round(perSiteDailyCost),
      perSiteProfitUpliftPerDay: profit.upliftPerDay,
      fleetVppAnnualRevenue: vpp.annualDrRevenue,
      fleetVppDividendPerYear: vpp.dividendContributionPerYear,
      headline: `광주기 안전(${photoperiod.requiredHours}h명기/${photoperiod.darkContinuousH}h암기) 위에서 ${thermal.season} 열통합·가격강건·이익최대(DLI+${
        profit.profitMaxDli - profit.costMinDli
      }) 최적화, 남은 유연성은 ${opts.sites}사이트 VPP로 묶어 연 ${Math.round(
        vpp.dividendContributionPerYear / 10000
      )}만원 회수 재원 창출.`,
    },
  };
}
