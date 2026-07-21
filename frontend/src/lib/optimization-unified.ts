// ── AI 운영 최적화 — 통합 공동최적화 (co-optimization) ──────────────────────
// 지금까지의 알고리즘은 순차 파이프라인이었다: DLI가 시간 정하면 → 열이 배치 →
// 강건이 검사. 상류 결정이 하류를 일방적으로 묶어, 하류의 기회(VPP·수율)가 상류
// 결정을 되돌리지 못했다. 통합 최적화는 하나의 목적함수로 전부 동시에 저울질한다.
//
// 결정변수: (광량 DLI 레벨, 광 블록 시작시각) — 두 변수를 SA로 함께 탐색.
// 목적(일 순가치 최대화):
//   + 수율매출(DLI↑ → 수율↑, 포화)      [Economic MPC]
//   − 전력량요금(가격 시나리오 기대값)    [TOU + 강건]
//   − 기본요금(피크)                      [피크분산]
//   − 순열비용(겨울 난방상쇄/여름 냉방)    [빛-열 통합]
//   − CO2비용(시간대 탄소집약도)          [ESG]
//   + VPP 유연성 가치(DR창 회피 시 유지)   [가상발전소]
//   − λ·CVaR(전력비 최악 5%)              [강건]
// 하드 제약: 광주기 안전(명기≤max, 연속암기≥min). DLI는 [최소, 이익최대] 범위.
// 문맥 적응: 계절이 열 가중치를, DR 달력이 VPP 가중치를 자동 조절 → 자연스럽게.

import { getCrop } from "./crop-profiles";
import { TARIFF_TOU_GENERAL, CARBON_INTENSITY_FACTOR, GRID_EMISSION_FACTOR } from "./optimization";
import { CROP_PHOTOPERIOD } from "./optimization-advanced";

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

export interface UnifiedWeights {
  thermal: number; // 열 항 가중 (계절이 조절)
  vpp: number; // VPP 유연성 가중 (DR 달력이 조절)
  co2: number; // 탄소 가중 (ESG 목표가 조절)
  robust: number; // CVaR 가중 (가격 변동성이 조절)
}

export interface UnifiedResult {
  dliChosen: number;
  ppfd: number;
  litHours: number[];
  darkContinuousH: number;
  photoperiodSafe: boolean;
  breakdown: {
    yieldRevenue: number;
    energyCost: number;
    demandCharge: number;
    thermalCost: number;
    co2Cost: number;
    vppValue: number;
    robustPenalty: number;
  };
  netDailyValue: number; // 순가치 (매출 − 비용)
  contextWeights: UnifiedWeights;
  tradeoffs: string[];
  vsSequentialNetValue: number; // 순차 파이프라인 대비 순가치 개선
  note: string;
}

export function unifiedCoOptimize(opts: {
  cropKey?: string;
  ledPowerKw: number;
  sites: number;
  hourlyExtTemp: number[]; // 24h
  tariff?: number[];
  cropPricePerKg?: number;
  areaM2?: number;
  drWindowHours?: number[]; // 예상 DR 이벤트 시간대 (이 시간에 LED 없으면 유연성↑)
  priceVolatility?: number;
  seed?: number;
}): UnifiedResult {
  const crop = getCrop(opts.cropKey);
  const pc = CROP_PHOTOPERIOD[crop.key] ?? { maxPhotoperiodH: 16, minDarkH: 6 };
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const price = opts.cropPricePerKg ?? 4000;
  const area = opts.areaM2 ?? 60;
  const vol = opts.priceVolatility ?? 0.35;
  const drWindows = opts.drWindowHours ?? [18, 19, 20]; // 저녁 피크 = DR 빈발
  const rand = mulberry32(opts.seed ?? 42);

  // ── 문맥 적응 가중치 (자연스러운 조절) ──
  const avgExt = opts.hourlyExtTemp.reduce((a, b) => a + b, 0) / 24;
  const season = avgExt < 12 ? "winter" : avgExt > 24 ? "summer" : "mild";
  const weights: UnifiedWeights = {
    thermal: season === "mild" ? 0.4 : 1.0, // 혹서·혹한기에 열 항 강조
    vpp: drWindows.length > 0 ? 1.0 : 0.3,
    co2: 0.6,
    robust: vol > 0.3 ? 0.6 : 0.2,
  };

  // 수율/비용 모델
  const ymax = 4.5;
  const k = 0.08;
  const yieldOf = (dli: number) => ymax * (1 - Math.exp(-k * dli));
  const dailyYieldRevenue = (dli: number) =>
    (yieldOf(dli) * area * price) / crop.cycleDays;

  // 가격 시나리오 (강건)
  const S = 60;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const scenarios: number[][] = [];
  for (let n = 0; n < S; n++)
    scenarios.push(tariff.map((p, h) => Math.max(30, p * (1 + gauss() * vol * (p > 180 ? 1.5 : 1)))));

  const TARGET_TEMP = 20;
  const heatCoef = 60;
  const coolCoef = 90;

  // 후보 평가: (dli, blockStart) → 통합 순가치
  const evalCandidate = (dli: number, start: number) => {
    // 광주기 안전: 필요 명기 계산(최대광주기 내로 PPFD 압축)
    let ppfd = crop.ppfd;
    let hours = Math.ceil(dli / ((ppfd * 3600) / 1e6));
    if (hours > pc.maxPhotoperiodH) {
      ppfd = Math.ceil((dli * 1e6) / (pc.maxPhotoperiodH * 3600));
      hours = pc.maxPhotoperiodH;
    }
    const darkH = 24 - hours;
    const safe = darkH >= pc.minDarkH;
    if (!safe) return null;
    const litHours = Array.from({ length: hours }, (_, i) => (start + i) % 24);
    const litSet = new Set(litHours);

    // 전력량요금: 시나리오 기대값 + CVaR
    const costs = scenarios
      .map((sc) => litHours.reduce((s, h) => s + opts.ledPowerKw * sc[h], 0))
      .sort((a, b) => a - b);
    const expEnergy = costs.reduce((a, b) => a + b, 0) / S;
    const cvar = costs.slice(Math.floor(S * 0.95)).reduce((a, b, _, arr) => a + b / arr.length, 0);

    // 기본요금(피크): LED+공조+펌프 동시가동 근사 (LED가 기저)
    const peakKw = opts.ledPowerKw + 1.5 + 0.7; // 최악 동시
    const demand = peakKw * 8320 / 30; // 일 환산

    // 순열비용: 시간대 외부온도 연동
    const thermal = litHours.reduce((s, h) => {
      const t = opts.hourlyExtTemp[h];
      return s + opts.ledPowerKw * (t < TARGET_TEMP ? -heatCoef * 0.95 : coolCoef * 0.95);
    }, 0);

    // CO2 비용 (시간대 탄소집약도, 탄소가격 근사 30원/kg)
    const co2 = litHours.reduce(
      (s, h) => s + opts.ledPowerKw * GRID_EMISSION_FACTOR * CARBON_INTENSITY_FACTOR[h] * 30,
      0
    );

    // VPP 유연성 가치: DR 창에 LED가 없으면(=그 시간 끌 필요 없어 유연) 가치↑
    const drOverlap = drWindows.filter((h) => litSet.has(h)).length;
    const vppFlexValue = ((drWindows.length - drOverlap) / Math.max(1, drWindows.length)) *
      (opts.ledPowerKw * opts.sites * 100 * 2) / 30 / opts.sites; // 일·사이트 환산 근사

    const revenue = dailyYieldRevenue(dli);
    const net =
      revenue -
      expEnergy -
      weights.thermal * thermal / 1 -
      weights.co2 * co2 -
      weights.robust * (cvar - expEnergy) +
      weights.vpp * vppFlexValue -
      demand;

    return {
      dli, ppfd, hours, litHours, darkH, safe,
      revenue, expEnergy, cvar, demand, thermal, co2, vppFlexValue, net,
    };
  };

  // SA 탐색: dli ∈ [dliMin, 이익범위 상한], start ∈ [0,24)
  const dliMin = Math.max(6, crop.dliTarget - 4);
  const dliMax = crop.dliTarget + 6;
  let cur = { dli: crop.dliTarget, start: 0 };
  let curEval = evalCandidate(cur.dli, cur.start)!;
  let best = cur;
  let bestEval = curEval;
  for (let it = 0; it < 6000; it++) {
    const temp = 500 * (1 - it / 6000) + 1;
    const next = {
      dli: Math.max(dliMin, Math.min(dliMax, cur.dli + Math.round((rand() - 0.5) * 6))),
      start: Math.floor(rand() * 24),
    };
    const ev = evalCandidate(next.dli, next.start);
    if (!ev) continue;
    if (ev.net > curEval.net || rand() < Math.exp((ev.net - curEval.net) / temp)) {
      cur = next;
      curEval = ev;
      if (ev.net > bestEval.net) {
        best = next;
        bestEval = ev;
      }
    }
  }

  // 순차 파이프라인 기준: DLI=목표 고정, 전력만 최저 배치 (비교용)
  const seqEval = (() => {
    let e = evalCandidate(crop.dliTarget, 0)!;
    for (let s = 1; s < 24; s++) {
      const c = evalCandidate(crop.dliTarget, s);
      if (c && c.expEnergy < e.expEnergy) e = c;
    }
    return e;
  })();

  // 트레이드오프 서술
  const tradeoffs: string[] = [];
  if (bestEval.dli > crop.dliTarget)
    tradeoffs.push(`채소값 반영해 DLI ${crop.dliTarget}→${bestEval.dli} 상향 (수율매출 > 추가 전기비)`);
  if (weights.thermal >= 1.0)
    tradeoffs.push(`${season}철: 열 항을 강조해 ${season === "winter" ? "추운" : "더운"} 시간대 ${season === "winter" ? "선호(난방상쇄)" : "회피(냉방)"}`);
  const drOverlap = drWindows.filter((h) => new Set(bestEval.litHours).has(h)).length;
  if (drOverlap < drWindows.length)
    tradeoffs.push(`DR창(${drWindows.join(",")}시) 중 ${drWindows.length - drOverlap}h를 비워 VPP 유연성 확보 — 최저요금을 조금 포기하고 수요반응 수익 유지`);

  return {
    dliChosen: bestEval.dli,
    ppfd: bestEval.ppfd,
    litHours: bestEval.litHours.slice().sort((a, b) => a - b),
    darkContinuousH: bestEval.darkH,
    photoperiodSafe: bestEval.safe,
    breakdown: {
      yieldRevenue: Math.round(bestEval.revenue),
      energyCost: Math.round(bestEval.expEnergy),
      demandCharge: Math.round(bestEval.demand),
      thermalCost: Math.round(bestEval.thermal),
      co2Cost: Math.round(bestEval.co2),
      vppValue: Math.round(bestEval.vppFlexValue),
      robustPenalty: Math.round(bestEval.cvar - bestEval.expEnergy),
    },
    netDailyValue: Math.round(bestEval.net),
    contextWeights: weights,
    tradeoffs,
    vsSequentialNetValue: Math.round(bestEval.net - seqEval.net),
    note: `${season}철·DR창 인지 통합 최적화: 6개 목적을 한 목적함수로 동시 저울질(순차 파이프라인 대비 순가치 +${Math.round(
      bestEval.net - seqEval.net
    )}원/일). 광주기 안전은 하드 제약, 가격은 ${S}시나리오 강건.`,
  };
}
