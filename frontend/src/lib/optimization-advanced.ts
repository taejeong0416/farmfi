// ── AI 운영 최적화 — 고도화 스택 (5개 돌파) ──────────────────────────────────
// 기본 엔진(optimization.ts)의 한계 4개를 뚫는다. 수직 조합:
//   광주기 안전(바닥 제약) → 빛-열-CO2 통합 → 확률적 강건 → 수율-이익 → 플릿 VPP(꼭대기)
// 각 단계가 다음의 입력이 된다: 광주기가 유연성의 상한을 정하고, 그 유연성을
// 이익 기준으로 값매기고, 불확실성에 강건화한 뒤, 플릿이 모아 전력망에 판다.

import { getCrop } from "./crop-profiles";
import { TARIFF_TOU_GENERAL } from "./optimization";

// 결정론적 PRNG (재현성 — 데모마다 동일)
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
function gaussFrom(rand: () => number) {
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

// ── 돌파 2: 광주기 안전 DLI (농학 하드 제약) ──────────────────────────────
// 순진한 DLI 스케줄러는 총 광량만 맞추면 시간을 마음대로 흩뿌린다 — 그러나 상추는
// 낮 길이(광주기)가 길면 추대(bolting)로 상품가치를 잃고, 생체리듬은 연속 암기를
// 요구한다. 그래서 (a) 명기 ≤ 최대광주기, (b) 연속 암기 ≥ 최소암기 를 하드 제약으로
// 걸고, 빛을 "연속 블록"으로만 배치한다. 절감은 산란보다 작지만 작물이 안전하다.
export interface PhotoperiodConstraints {
  maxPhotoperiodH: number; // 추대 방지 최대 명기(엽채류 ~16h)
  minDarkH: number; // 생체리듬 최소 연속 암기(~6h)
}

export const CROP_PHOTOPERIOD: Record<string, PhotoperiodConstraints> = {
  leafy: { maxPhotoperiodH: 16, minDarkH: 6 }, // 상추 장일 추대 회피
  basil: { maxPhotoperiodH: 18, minDarkH: 5 },
  cherryTomato: { maxPhotoperiodH: 17, minDarkH: 6 }, // 연속광 장해 회피
  microgreen: { maxPhotoperiodH: 20, minDarkH: 4 }, // 수확 빠름, 관대
};

export interface PhotoperiodSafePlan {
  cropLabel: string;
  requiredHours: number; // DLI 충족 명기 (PPFD 상향 반영)
  ppfdUsed: number;
  litHours: number[]; // 연속 광 블록
  darkContinuousH: number; // 확보된 연속 암기
  safe: boolean; // 광주기 제약 충족
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
  const pc = CROP_PHOTOPERIOD[crop.key] ?? { maxPhotoperiodH: 16, minDarkH: 6 };
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const dliTarget = opts.dliTarget ?? crop.dliTarget;
  let ppfd = opts.ppfd ?? crop.ppfd;

  // 필요 명기 = DLI / 시간당기여. 최대광주기 초과 시 PPFD를 올려 시간을 압축.
  const hoursAt = (p: number) => Math.ceil(dliTarget / ((p * 3600) / 1e6));
  let requiredHours = hoursAt(ppfd);
  if (requiredHours > pc.maxPhotoperiodH) {
    // maxPhotoperiodH 안에 담기도록 PPFD 상향
    ppfd = Math.ceil((dliTarget * 1e6) / (pc.maxPhotoperiodH * 3600));
    requiredHours = hoursAt(ppfd);
  }
  requiredHours = Math.min(requiredHours, pc.maxPhotoperiodH);

  const darkH = 24 - requiredHours;
  const safe = requiredHours <= pc.maxPhotoperiodH && darkH >= pc.minDarkH;

  // 연속 광 블록을 최저요금 위치에 배치 (자동으로 연속 암기 24-requiredHours 확보)
  let bestStart = 0;
  let bestCost = Infinity;
  for (let s = 0; s < 24; s++) {
    let c = 0;
    for (let i = 0; i < requiredHours; i++) c += opts.ledPowerKw * tariff[(s + i) % 24];
    if (c < bestCost) {
      bestCost = c;
      bestStart = s;
    }
  }
  const litHours = Array.from({ length: requiredHours }, (_, i) => (bestStart + i) % 24);

  // 비교: 산란(가장 싼 시간 아무거나 — 비안전) 배치 비용
  const order = [...Array(24).keys()].sort((a, b) => tariff[a] - tariff[b]);
  const scatterCost = order
    .slice(0, requiredHours)
    .reduce((s, h) => s + opts.ledPowerKw * tariff[h], 0);

  return {
    cropLabel: crop.label,
    requiredHours,
    ppfdUsed: ppfd,
    litHours,
    darkContinuousH: darkH,
    safe,
    costPerDay: Math.round(bestCost),
    naiveScatterCostPerDay: Math.round(scatterCost),
    safetyCostPerDay: Math.round(bestCost - scatterCost),
    note: safe
      ? `연속 명기 ${requiredHours}h + 연속 암기 ${darkH}h 확보 (추대·생체리듬 안전). 안전 비용 +${Math.round(bestCost - scatterCost)}원/일`
      : `제약 충족 불가 — PPFD ${ppfd}로도 광주기 초과. 시설 광량 재설계 필요`,
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
  const heatCoef = opts.heatCoef ?? 60; // 난방 대체가치
  const coolCoef = opts.coolCoef ?? 90; // 냉방 추가비용
  const avgExt = opts.hourlyExtTemp.reduce((a, b) => a + b, 0) / 24;
  const season = avgExt < 12 ? "winter" : avgExt > 24 ? "summer" : "mild";

  // 시간별 LED 1kWh의 순비용 = 전력요금 − (겨울 난방크레딧) + (여름 냉방페널티)
  // LED 열 ≈ 전력의 0.95배. 실내 목표온도 20℃ 가정.
  const TARGET = 20;
  const hourNetCost = (h: number) => {
    const elec = tariff[h];
    const ext = opts.hourlyExtTemp[h];
    let thermal = 0;
    if (ext < TARGET) thermal = -heatCoef * 0.95; // 난방 상쇄(크레딧)
    else thermal = coolCoef * 0.95; // 냉방 가산(페널티)
    return elec + thermal;
  };

  // 통합비용 기준 연속 광블록 최적 배치
  let bestStart = 0;
  let bestCost = Infinity;
  for (let s = 0; s < 24; s++) {
    let c = 0;
    for (let i = 0; i < P; i++) c += opts.ledPowerKw * hourNetCost((s + i) % 24);
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
  const elecOnlyTotal = elecOnlyLit.reduce((s, h) => s + opts.ledPowerKw * hourNetCost(h), 0);

  const energyCost = litHours.reduce((s, h) => s + opts.ledPowerKw * tariff[h], 0);
  const netThermal = bestCost - energyCost;

  return {
    season,
    litHours,
    energyCostPerDay: Math.round(energyCost),
    netThermalCostPerDay: Math.round(netThermal),
    totalCostPerDay: Math.round(bestCost),
    vsEnergyOnlyPerDay: Math.round(elecOnlyTotal - bestCost),
    note:
      season === "winter"
        ? `겨울: LED 열로 난방 상쇄 — 추운 시간대 점등이 유리. 전력만 최적화 대비 ${Math.round(elecOnlyTotal - bestCost)}원/일 개선`
        : season === "summer"
          ? `여름: LED 열이 냉방 부하 — 더운 시간대 회피. 전력만 최적화 대비 ${Math.round(elecOnlyTotal - bestCost)}원/일 개선`
          : `간절기: 열 영향 작음`,
  };
}

// ── 돌파 4: 확률적 강건 최적화 (SMP 실시간가격 대응) ──────────────────────
// 고정 TOU 한 장에 전부 거는 대신, 실시간 도매가격(SMP) 시나리오를 샘플링해
// 여러 미래에 강건한 스케줄을 고른다. 목적 = 기대비용 + λ·CVaR(최악 5% 평균).
export interface RobustPlan {
  scenarios: number;
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
export interface ProfitPlan {
  profitMaxDli: number;
  costMinDli: number; // 기본(작물 목표 DLI)
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
  avgTariff?: number;
}): ProfitPlan {
  const crop = getCrop(opts.cropKey);
  const area = opts.areaM2 ?? 60;
  const price = opts.cropPricePerKg ?? 4000; // 상추 산지가 근사
  const ymax = opts.yieldMaxKgM2 ?? 4.5; // ㎡당 사이클 수율 포화
  const k = opts.yieldK ?? 0.08;
  const avgTariff = opts.avgTariff ?? 140;
  const ppfd = crop.ppfd;

  const yieldOf = (dli: number) => ymax * (1 - Math.exp(-k * dli));
  const costOf = (dli: number) => {
    const hours = dli / ((ppfd * 3600) / 1e6);
    return opts.ledPowerKw * hours * avgTariff; // 원/일 (사이트 전체 LED)
  };
  // 이익 = 수율가치(원/일 환산) − 전기비. 수율은 사이클(cycleDays)에 걸쳐 실현 → 일 환산.
  const profitOf = (dli: number) => {
    const cycleRevenue = yieldOf(dli) * area * price;
    const dailyRevenue = cycleRevenue / crop.cycleDays;
    return dailyRevenue - costOf(dli);
  };

  const frontier: ProfitPlan["frontier"] = [];
  let bestDli = crop.dliTarget;
  let bestProfit = -Infinity;
  for (let dli = 4; dli <= 30; dli += 1) {
    const p = profitOf(dli);
    frontier.push({
      dli,
      yield: Math.round(yieldOf(dli) * 100) / 100,
      cost: Math.round(costOf(dli)),
      profit: Math.round(p),
    });
    if (p > bestProfit) {
      bestProfit = p;
      bestDli = dli;
    }
  }

  return {
    profitMaxDli: bestDli,
    costMinDli: crop.dliTarget,
    profitAtOptimum: Math.round(bestProfit),
    profitAtTarget: Math.round(profitOf(crop.dliTarget)),
    upliftPerDay: Math.round(bestProfit - profitOf(crop.dliTarget)),
    frontier: frontier.filter((f) => f.dli % 2 === 0),
    note:
      bestDli > crop.dliTarget
        ? `채소값 ${price}원/kg에선 목표 DLI ${crop.dliTarget}→${bestDli}로 광량 상향이 이익 최대(수율 증가 > 전기비). 일 +${Math.round(
            bestProfit - profitOf(crop.dliTarget)
          )}원`
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
  annualDrRevenue: number;
  dividendContributionPerYear: number; // 배당 풀 기여 (60%)
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
  const contractedKw = ledKw * opts.sites;

  const basicPrice = opts.basicPricePerKwYear ?? 43994; // 전력거래소 공시(2017)
  const perfPrice = opts.performancePricePerKwh ?? 100; // 실적정산 근사 ₩/kWh
  const events = opts.drEventsPerMonth ?? 4;
  const eventH = opts.drEventHours ?? 2;
  const reductionHoursPerYear = events * eventH * 12;

  const basic = contractedKw * basicPrice;
  const performance = contractedKw * perfPrice * reductionHoursPerYear;
  const total = basic + performance;
  const share = opts.dividendShare ?? 0.6;

  return {
    sites: opts.sites,
    contractedKw: Math.round(contractedKw),
    reductionHoursPerYear,
    basicSettlementPerYear: Math.round(basic),
    performanceSettlementPerYear: Math.round(performance),
    annualDrRevenue: Math.round(total),
    dividendContributionPerYear: Math.round(total * share),
    note: `${opts.sites}개 사이트 = ${Math.round(
      contractedKw
    )}kW 계약감축. 기본정산 ${Math.round(basic / 10000)}만(대기 대가) + 실적정산 ${Math.round(
      performance / 10000
    )}만(연 ${reductionHoursPerYear}h 감축) = 연 ${Math.round(
      total / 10000
    )}만원 매출 → 배당 풀에 연 ${Math.round(
      (total * share) / 10000
    )}만원 기여. 광주기 유연성 ${flexH}h를 판매. 절감이 아니라 새 수익원.`,
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
  // ② 빛-열 통합 (안전 명기 시간을 계절 최적 배치)
  const thermal = thermalCoupledSchedule({
    cropKey: opts.cropKey,
    ledPowerKw: opts.ledPowerKw,
    requiredHours: photoperiod.requiredHours,
    hourlyExtTemp: opts.hourlyExtTemp,
    tariff: opts.tariff,
  });
  // ③ 강건 (가격 불확실성)
  const robust = robustSchedule({
    ledPowerKw: opts.ledPowerKw,
    requiredHours: photoperiod.requiredHours,
    baseTariff: opts.tariff,
  });
  // ④ 수율-이익 (광량 자체 최적화)
  const profit = profitOptimization({
    cropKey: opts.cropKey,
    ledPowerKw: opts.ledPowerKw,
    cropPricePerKg: opts.cropPricePerKg,
  });
  // ⑤ 플릿 VPP (광주기 안전 내 남은 유연성을 판다)
  const flexHours = Math.max(0, 24 - photoperiod.requiredHours - photoperiod.darkContinuousH + 3);
  const vpp = fleetVPP({
    sites: opts.sites,
    ledPowerKw: opts.ledPowerKw,
    photoperiodFlexHours: Math.min(3, flexHours || 3),
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
      )}만원 배당 창출.`,
    },
  };
}
