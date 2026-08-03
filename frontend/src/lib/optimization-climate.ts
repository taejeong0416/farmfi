// ── CO2와 광량의 대체 최적화 ────────────────────────────────────────────────
// 광합성은 광량과 CO2가 함께 작용한다. CO2를 올리면 광포화점이 올라가 같은 광량으로
// 더 많이 자란다 — 즉 **CO2 시비가 전력을 대체할 수 있다.** 지금까지 CO2는 정상범위
// 감시 대상일 뿐 최적화 변수가 아니었고, 그래서 "빛을 싸게 사는" 축만 있고
// "빛을 덜 사도 되게 만드는" 축이 없었다.
//
// 수율모델: y(DLI, CO2) = ymax · f(CO2) · (1 − e^(−k·DLI))
//   f(CO2) = (CO2/(CO2+Km)) / (CO2ref/(CO2ref+Km))   — 미카엘리스-멘텐 포화, 대기 400ppm에서 1.0
// 밀폐 재배실은 온실보다 시비 효율이 좋아(누기 적음) 대체 효과가 크다.
// 근거: 광-CO2-온도 상호작용 반응면 문헌(ASHS JASHS 147(2), 2022) 및
//       광·CO2 비용 동시 최적화 사례(Expert Systems with Applications, 2023).

import { resolveLighting } from "./optimization";
import { getCrop } from "./crop-profiles";
import { PARAMS } from "./optimization-params";

/** 대기 CO2 농도 (ppm) — 시비의 기준선 */
export const CO2_AMBIENT_PPM = 400;
/** 광합성 CO2 반포화 상수 (ppm) — 반응면 문헌의 엽채류 범위 근사 */
export const CO2_HALF_SATURATION_PPM = 300;
/** CO2 밀도 (kg/m³, 상온) */
const CO2_DENSITY = 1.98;

export function co2YieldFactor(ppm: number, km = CO2_HALF_SATURATION_PPM): number {
  const at = (c: number) => c / (c + km);
  return at(Math.max(0, ppm)) / at(CO2_AMBIENT_PPM);
}

export interface Co2LightPoint {
  co2Ppm: number;
  dli: number;
  yieldKgM2: number;
  lightCostPerDay: number;
  co2CostPerDay: number;
  totalCostPerDay: number;
  profitPerDay: number;
}

export interface Co2LightPlan {
  chosen: Co2LightPoint;
  /** CO2 시비 없이 광량만 쓴 최적점 — 비교 기준 */
  lightOnly: Co2LightPoint;
  profitUpliftPerDay: number;
  /** CO2 +100ppm이 대체하는 DLI — 두 축의 교환비 */
  substitutionDliPer100Ppm: number;
  co2KgPerDay: number;
  feasible: boolean;
  note: string;
}

// 목표 농도를 유지하는 데 드는 CO2 주입량(kg/일).
// 재배실이 시간당 lossRate만큼 공기를 갈아치운다고 보고, 그때마다 (목표−대기) 농도차를
// 다시 채운다. 시비는 명기에만 한다(암기엔 광합성이 없어 시비 가치가 없다).
export function co2InjectionKgPerDay(opts: {
  targetPpm: number;
  roomVolumeM3: number;
  litHours: number;
  lossRatePerHour?: number;
}): number {
  const loss = opts.lossRatePerHour ?? PARAMS.co2LossRatePerHour.value;
  const deltaPpm = Math.max(0, opts.targetPpm - CO2_AMBIENT_PPM);
  const kgPerAirChange = deltaPpm * 1e-6 * opts.roomVolumeM3 * CO2_DENSITY;
  return kgPerAirChange * loss * opts.litHours;
}

export function co2LightCoOptimize(opts: {
  cropKey?: string;
  ledPowerKw: number;
  areaM2?: number;
  roomHeightM?: number;
  cropPricePerKg?: number;
  avgTariff?: number;
  co2CostPerKg?: number;
  /** 시비 상한 — 이 이상은 광합성 이득이 미미하고 작업자 안전 문제가 생긴다 */
  maxCo2Ppm?: number;
}): Co2LightPlan {
  const crop = getCrop(opts.cropKey);
  const area = opts.areaM2 ?? 60;
  const height = opts.roomHeightM ?? 2.7;
  const volume = area * height;
  const price = opts.cropPricePerKg ?? PARAMS.cropPricePerKg.value;
  const avgTariff = opts.avgTariff ?? 140;
  const co2Cost = opts.co2CostPerKg ?? PARAMS.co2CostPerKg.value;
  const maxCo2 = opts.maxCo2Ppm ?? 1200;
  const ymax = PARAMS.yieldMaxKgM2.value;
  const k = PARAMS.yieldLightK.value;

  const evaluate = (dli: number, ppm: number): Co2LightPoint | null => {
    const light = resolveLighting({
      cropKey: opts.cropKey,
      dliTarget: dli,
      ledPowerKw: opts.ledPowerKw,
    });
    if (!light.feasible || !light.photoperiodSafe) return null;

    const yieldKgM2 = ymax * co2YieldFactor(ppm) * (1 - Math.exp(-k * dli));
    const lightCost = light.ledPowerKw * light.hours * avgTariff;
    const co2Kg = co2InjectionKgPerDay({
      targetPpm: ppm,
      roomVolumeM3: volume,
      litHours: light.hours,
    });
    const co2CostPerDay = co2Kg * co2Cost;
    const revenue = (yieldKgM2 * area * price) / crop.cycleDays;
    return {
      co2Ppm: ppm,
      dli,
      yieldKgM2: Math.round(yieldKgM2 * 100) / 100,
      lightCostPerDay: Math.round(lightCost),
      co2CostPerDay: Math.round(co2CostPerDay),
      totalCostPerDay: Math.round(lightCost + co2CostPerDay),
      profitPerDay: Math.round(revenue - lightCost - co2CostPerDay),
    };
  };

  // 전수열거: DLI 6~26 × CO2 400~maxCo2 (50ppm 간격). 탐색공간이 작아 전역 최적 보장.
  let best: Co2LightPoint | null = null;
  let lightOnly: Co2LightPoint | null = null;
  for (let dli = 6; dli <= 26; dli += 1) {
    for (let ppm = CO2_AMBIENT_PPM; ppm <= maxCo2; ppm += 50) {
      const pt = evaluate(dli, ppm);
      if (!pt) continue;
      if (!best || pt.profitPerDay > best.profitPerDay) best = pt;
      if (ppm === CO2_AMBIENT_PPM && (!lightOnly || pt.profitPerDay > lightOnly.profitPerDay))
        lightOnly = pt;
    }
  }

  if (!best || !lightOnly) {
    return {
      chosen: {
        co2Ppm: CO2_AMBIENT_PPM,
        dli: crop.dliTarget,
        yieldKgM2: 0,
        lightCostPerDay: 0,
        co2CostPerDay: 0,
        totalCostPerDay: 0,
        profitPerDay: 0,
      },
      lightOnly: {
        co2Ppm: CO2_AMBIENT_PPM,
        dli: crop.dliTarget,
        yieldKgM2: 0,
        lightCostPerDay: 0,
        co2CostPerDay: 0,
        totalCostPerDay: 0,
        profitPerDay: 0,
      },
      profitUpliftPerDay: 0,
      substitutionDliPer100Ppm: 0,
      co2KgPerDay: 0,
      feasible: false,
      note: "광주기·정격 제약 안에서 실행 가능한 조합이 없음 — 광량 설계 재검토 필요",
    };
  }

  // 대체율: 기준점의 수율을 CO2만 100ppm 올려 유지할 때 줄일 수 있는 DLI.
  // y(D, C) = y(D', C+100) 을 D'에 대해 푼다.
  const baseDli = lightOnly.dli;
  const factorNow = co2YieldFactor(CO2_AMBIENT_PPM);
  const factorUp = co2YieldFactor(CO2_AMBIENT_PPM + 100);
  const targetTerm = (factorNow / factorUp) * (1 - Math.exp(-k * baseDli));
  const substitution =
    targetTerm < 1 ? baseDli - -Math.log(1 - targetTerm) / k : baseDli;

  const chosenLight = resolveLighting({
    cropKey: opts.cropKey,
    dliTarget: best.dli,
    ledPowerKw: opts.ledPowerKw,
  });
  const co2Kg = co2InjectionKgPerDay({
    targetPpm: best.co2Ppm,
    roomVolumeM3: volume,
    litHours: chosenLight.hours,
  });

  return {
    chosen: best,
    lightOnly,
    profitUpliftPerDay: best.profitPerDay - lightOnly.profitPerDay,
    substitutionDliPer100Ppm: Math.round(Math.max(0, substitution) * 100) / 100,
    co2KgPerDay: Math.round(co2Kg * 100) / 100,
    feasible: true,
    note:
      best.co2Ppm > CO2_AMBIENT_PPM
        ? `CO2 ${best.co2Ppm}ppm 시비 + DLI ${best.dli} 조합이 이익 최대 — 시비 없이 광량만 쓴 최적(DLI ${lightOnly.dli})보다 일 ${
            best.profitPerDay - lightOnly.profitPerDay
          }원. CO2 100ppm이 DLI ${Math.round(Math.max(0, substitution) * 100) / 100}을 대체하므로, 전기를 더 사는 대신 탄산을 사는 선택지가 생긴다.`
        : `현 단가(CO2 ${co2Cost}원/kg, 전력 ${avgTariff}원/kWh)에서는 시비가 전력을 대체하지 못한다 — 광량만 쓰는 편이 이익 최대. 탄산 단가가 내리거나 전기가 오르면 뒤집힌다.`,
  };
}
