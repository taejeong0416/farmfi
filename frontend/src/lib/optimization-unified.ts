// ── AI 운영 최적화 — 통합 공동최적화 (co-optimization) ──────────────────────
// 지금까지의 알고리즘은 순차 파이프라인이었다: DLI가 시간 정하면 → 열이 배치 →
// 강건이 검사. 상류 결정이 하류를 일방적으로 묶어, 하류의 기회(VPP·수율)가 상류
// 결정을 되돌리지 못했다. 통합 최적화는 하나의 목적함수로 전부 동시에 저울질한다.
//
// 결정변수: (광량 DLI 레벨, 광 블록 시작시각) — 두 변수를 전수열거로 함께 탐색.
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
import {
  TARIFF_TOU_GENERAL,
  CARBON_INTENSITY_FACTOR,
  GRID_EMISSION_FACTOR,
  resolveLighting,
} from "./optimization";
import { mulberry32, gaussFrom } from "./prng";

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
  hourlyExtTemp: number[]; // 24h
  tariff?: number[];
  cropPricePerKg?: number;
  areaM2?: number;
  drWindowHours?: number[]; // 예상 DR 이벤트 시간대 (이 시간에 LED 없으면 유연성↑)
  priceVolatility?: number;
  seed?: number;
}): UnifiedResult {
  const crop = getCrop(opts.cropKey);
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
    // 혹서·혹한기: 3.0으로 강화해 비례 열비용이 블록 배치를 실제로 뒤집게 함
    thermal: season === "mild" ? 0.4 : 3.0,
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

  // 가격 시나리오 (강건) — S=400: top 5% = 20표본으로 CVaR95 통계적으로 유의
  const S = 400;
  const gauss = gaussFrom(rand);
  const scenarios: number[][] = [];
  for (let n = 0; n < S; n++)
    scenarios.push(tariff.map((p) => Math.max(30, p * (1 + gauss() * vol * (p > 180 ? 1.5 : 1)))));

  const TARGET_TEMP = 20;
  const heatCoef = 60;
  const coolCoef = 90;

  // 후보 평가: (dli, blockStart) → 통합 순가치
  const evalCandidate = (dli: number, start: number) => {
    // 광주기 안전 + 정격 상한을 함께 푼다. 명기가 최대광주기를 넘으면 PPFD를 올려
    // 시간을 압축하는데, 그만큼 소비전력도 오른다(ledPowerKw) — 이 스케일이 빠지면
    // 광량 증설이 공짜가 되어 최적해가 항상 탐색 상한에 붙는다.
    const light = resolveLighting({
      cropKey: opts.cropKey,
      dliTarget: dli,
      ledPowerKw: opts.ledPowerKw,
    });
    if (!light.feasible || !light.photoperiodSafe) return null;
    const { hours, ppfd, darkH, ledPowerKw: kw } = light;
    const litHours = Array.from({ length: hours }, (_, i) => (start + i) % 24);
    const litSet = new Set(litHours);

    // 전력량요금: 시나리오 기대값 + CVaR
    const costs = scenarios
      .map((sc) => litHours.reduce((s, h) => s + kw * sc[h], 0))
      .sort((a, b) => a - b);
    const expEnergy = costs.reduce((a, b) => a + b, 0) / S;
    const cvar = costs.slice(Math.floor(S * 0.95)).reduce((a, b, _, arr) => a + b / arr.length, 0);

    // 기본요금(피크): 시간별 부하 프로파일로 실제 피크 동적 계산 (peakStagger 방식)
    // 공조(1.5kW)는 LED와 동기 가동(식물 환경 유지 필수), 펌프(0.7kW, 8h/일)는
    // 유연 — 부하 가장 낮은 시간대에 배치해 피크 최소화.
    const hourProfile = Array(24).fill(0);
    for (const h of litHours) hourProfile[h] += kw + 1.5;
    const pumpSlots = [...Array(24).keys()]
      .sort((a, b) => hourProfile[a] - hourProfile[b])
      .slice(0, 8);
    for (const h of pumpSlots) hourProfile[h] += 0.7;
    const peakKw = Math.max(...hourProfile);
    const demand = peakKw * 8320 / 30; // 일 환산

    // 순열비용: 시간별 외부온도 비례 연동
    // 이진 방식(t<20 ? -fixed : +fixed)은 겨울에 모든 시간이 동일값 → 블록 배치 구분 불가.
    // 비례 방식: 더 추울수록 LED 발열 이득↑(음수 증가), 더 더울수록 냉방 부하↑(양수 증가).
    const thermal = litHours.reduce((s, h) => {
      const t = opts.hourlyExtTemp[h];
      const delta = t - TARGET_TEMP;
      return s + kw * (delta < 0
        ? delta * heatCoef * 0.05   // 겨울: 더 추운 시간대 = 더 큰 난방상쇄 이득 (음수)
        : delta * coolCoef * 0.05); // 여름: 더 더운 시간대 = 더 큰 냉방 부하 (양수)
    }, 0);

    // CO2 비용 (시간대 탄소집약도, 탄소가격 근사 30원/kg)
    const co2 = litHours.reduce(
      (s, h) => s + kw * GRID_EMISSION_FACTOR * CARBON_INTENSITY_FACTOR[h] * 30,
      0
    );

    // VPP 유연성 가치: DR 창에 LED가 없으면(=그 시간 끌 필요 없어 유연) 가치↑
    const drOverlap = drWindows.filter((h) => litSet.has(h)).length;
    const vppFlexValue =
      ((drWindows.length - drOverlap) / Math.max(1, drWindows.length)) *
      ((kw * 100 * 2) / 30); // 일·사이트 환산 근사

    const revenue = dailyYieldRevenue(dli);
    const net =
      revenue -
      expEnergy -
      weights.thermal * thermal -
      weights.co2 * co2 -
      weights.robust * (cvar - expEnergy) +
      weights.vpp * vppFlexValue -
      demand;

    return {
      dli, ppfd, hours, litHours, darkH, safe: light.photoperiodSafe,
      revenue, expEnergy, cvar, demand, thermal, co2, vppFlexValue, net,
    };
  };

  // 전수열거: dli × start = (dliMax-dliMin+1) × 24 ≈ 264개.
  // 탐색공간이 작아 SA보다 전수열거가 정직하고 완전하다(전역 최적 보장).
  const dliMin = Math.max(6, crop.dliTarget - 4);
  const dliMax = crop.dliTarget + 6;
  let bestEvalOrNull: ReturnType<typeof evalCandidate> = null;
  for (let dli = dliMin; dli <= dliMax; dli++) {
    for (let start = 0; start < 24; start++) {
      const ev = evalCandidate(dli, start);
      if (!ev) continue;
      if (!bestEvalOrNull || ev.net > bestEvalOrNull.net) bestEvalOrNull = ev;
    }
  }
  if (!bestEvalOrNull) {
    // 탐색 구간 전체가 광주기·정격 제약에 걸림 — 이 설비로는 어떤 DLI도 안전하게
    // 만들 수 없다는 뜻이므로 최적화 결과를 지어내지 않고 그대로 알린다.
    throw new Error(
      `${crop.label}: DLI ${dliMin}~${dliMax} 전 구간이 광주기·정격 제약 밖. 광량 설계(maxPpfd/maxPhotoperiodH) 재검토 필요`
    );
  }
  const bestEval = bestEvalOrNull;

  // 순차 파이프라인 기준: DLI=목표 고정, 전력만 최저 배치 (비교용).
  // 목표 DLI가 제약 밖이면 비교 자체가 성립하지 않으므로 통합해를 그대로 쓴다(개선 0).
  const seqEval = (() => {
    let e: NonNullable<ReturnType<typeof evalCandidate>> | null = null;
    for (let s = 0; s < 24; s++) {
      const c = evalCandidate(crop.dliTarget, s);
      if (c && (!e || c.expEnergy < e.expEnergy)) e = c;
    }
    return e ?? bestEval;
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
    litHours: bestEval.litHours,
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
