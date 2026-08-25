// ── 수익 최적 레시피 — 목적함수에 비용을 넣는다 ──────────────────────────────
// 레시피 층이 수율만 최대화하면 비싼 목표를 정하고, 스케줄 층은 그 비싼 목표를
// 최대한 싸게 달성한다. 두 층이 서로 다른 목적함수를 들고 있으니 "맞물린다"는
// 말이 실제로는 성립하지 않는다.
//
// 여기서 목적함수를 하나로 합친다.
//   수익(x) = 가격 × 수율(x) − 운전비용(x)
// 수율은 학습된 반응표면에서, 비용은 요금·물리에서 온다. 그러면 CO₂와 DLI의
// 최적점이 스스로 내려오고, 내려온 만큼이 곧 "수율만 봤을 때 태우던 돈"이다.
//
// 비용이 붙는 요인은 셋뿐이다 — DLI(LED 전력과 그 폐열), CO₂(시비), 온도(공조).
// 습도·EC·pH는 이 모델에서 비용이 없으므로 수율 최적점이 그대로 수익 최적점이다.
// 실제로는 제습 전력과 양액 원가가 있지만, 그 값을 셀 근거가 없어 0으로 둔다 —
// 없는 값을 지어내느니 어느 요인이 비용 밖인지 밝히는 편이 낫다.

import {
  GrowthRecipe,
  predictSurface,
  zBounds,
  FEATURES,
  FEATURE_LABEL,
  UNIT,
  GrowthFeature,
  GrowthObservation,
} from "./growth-recipe";
import { toNormalized, fromNormalized } from "./crop-normalize";
import { getCrop } from "./crop-profiles";
import { PARAMS } from "./optimization-params";
import { resolveLighting, ledThermalCostPerHour, TARIFF_FLAT_GENERAL } from "./optimization";
import { co2InjectionKgPerDay, CO2_AMBIENT_PPM } from "./optimization-climate";

export interface ProfitCostBreakdown {
  /** 원/일 */
  light: number;
  thermal: number;
  co2: number;
  total: number;
}

export interface ProfitPoint {
  setpoints: Record<GrowthFeature, number>;
  yieldKgM2: number;
  revenuePerDay: number;
  cost: ProfitCostBreakdown;
  profitPerDay: number;
  /** 광주기·정격 제약을 지키는 점인가 */
  feasible: boolean;
}

export interface ProfitSetpoint {
  feature: string;
  label: string;
  unit: string;
  /** 수율만 최대화했을 때의 값 */
  yieldOptimum: number;
  /** 수익을 최대화했을 때의 값 */
  profitOptimum: number;
  /** 비용을 넣으면 얼마나 움직이나 */
  shift: number;
  /** 이 모델에서 비용이 붙는 요인인가 */
  costed: boolean;
}

export interface ProfitRecipe {
  setpoints: ProfitSetpoint[];
  atYieldOptimum: ProfitPoint;
  atProfitOptimum: ProfitPoint;
  /** 수율 최적점을 그대로 쫓았을 때 하루에 버리는 돈 (원) */
  foregoneProfitPerDay: number;
  note: string;
}

/** 이 모델에서 비용이 붙는 요인 */
const COSTED: GrowthFeature[] = ["dli", "co2", "temp"];

// 보조부하가 동시에 걸릴 때의 합계 kW. 계약전력에서 LED가 쓸 수 있는 몫을 정한다.
const AUX_PEAK_KW = PARAMS.auxLoads.value.reduce((s, l) => s + l.kw, 0);

export interface ProfitOptions {
  cropKey?: string;
  ledPowerKw?: number;
  areaM2?: number;
  roomHeightM?: number;
  cropPricePerKg?: number;
  co2CostPerKg?: number;
  /** 실효 전력 단가(원/kWh). 생략 시 기저 TOU 24시간 평균 */
  avgTariff?: number;
  /** 공조 비용을 가르는 외기 평균온도(℃) */
  externalTempC?: number;
  /**
   * 계약전력(kW). LED와 보조부하의 합이 이 값을 넘는 운전점은 실행할 수 없다.
   *
   * 이 제약이 없으면 최적화가 계약 밖 구간을 평가한다. 상추 프로파일 기준으로
   * 목표 DLI 16에서 이미 LED 5.07 + 보조 2.2 = 7.27kW라 계약 7kW를 넘는다 —
   * 즉 수율 최적점 자체가 실행 불가능한 점이 되고, 그걸 기준으로 잰 "수익 최적점의
   * 개선폭"도 도달할 수 없는 값 대비가 된다. 스케줄 층은 이 제약을 이미 쓰므로,
   * 두 층이 같은 목적함수를 본다는 주장이 성립하려면 제약 집합도 같아야 한다.
   */
  contractKw?: number;
}

function evaluate(
  z: number[],
  fit: GrowthRecipe,
  o: Required<Omit<ProfitOptions, "cropKey">> & { cropKey: string }
): ProfitPoint {
  const crop = getCrop(o.cropKey);
  const phys = fromNormalized(z, o.cropKey);
  const volume = o.areaM2 * o.roomHeightM;

  // 수율은 학습된 표면에서. 음수 예측은 물리적으로 뜻이 없으므로 0에서 자른다.
  const yieldKgM2 = fit._beta ? Math.max(0, predictSurface(fit._beta, z)) : 0;
  const revenuePerDay = (yieldKgM2 * o.areaM2 * o.cropPricePerKg) / crop.cycleDays;

  const light = resolveLighting({
    cropKey: o.cropKey,
    dliTarget: phys.dli,
    ledPowerKw: o.ledPowerKw,
  });
  const lightCost = light.ledPowerKw * light.hours * o.avgTariff;
  // LED 폐열은 실온 목표에 따라 이득도 되고 비용도 된다 — 온도 설정점이 여기로 들어간다
  const thermalCost =
    ledThermalCostPerHour({
      ledPowerKw: light.ledPowerKw,
      externalTempC: o.externalTempC,
      targetTempC: phys.temp,
    }) * light.hours;
  const co2Kg = co2InjectionKgPerDay({
    targetPpm: Math.max(CO2_AMBIENT_PPM, phys.co2),
    roomVolumeM3: volume,
    litHours: light.hours,
    areaM2: o.areaM2,
  });
  const co2Cost = co2Kg * o.co2CostPerKg;

  const total = lightCost + thermalCost + co2Cost;
  return {
    setpoints: phys,
    yieldKgM2: Math.round(yieldKgM2 * 100) / 100,
    revenuePerDay: Math.round(revenuePerDay),
    cost: {
      light: Math.round(lightCost),
      thermal: Math.round(thermalCost),
      co2: Math.round(co2Cost),
      total: Math.round(total),
    },
    profitPerDay: Math.round(revenuePerDay - total),
    // 광주기·정격에 더해 계약전력도 하드 제약이다. LED와 보조부하가 동시에 걸리는
    // 순간이 계약을 넘으면 그 운전점은 존재하지 않는다.
    feasible:
      light.feasible &&
      light.photoperiodSafe &&
      light.ledPowerKw + AUX_PEAK_KW <= o.contractKw,
  };
}

/**
 * 학습된 반응표면 위에서 수익 최적 설정점을 찾는다.
 *
 * 수율은 z의 이차식이지만 비용은 그렇지 않다 — resolveLighting의 광주기 상한과
 * 정격 PPFD, 압축기 COP 저하가 모두 꺾인 점을 만든다. 그래서 좌표상승의 닫힌
 * 해를 쓰지 못하고 좌표별 격자 탐색을 몇 번 훑는다. 6차원 × 41점 × 3회로
 * 충분하다 — 탐색 상자가 정상범위로 이미 좁혀져 있다.
 */
export function profitOptimalRecipe(
  obs: GrowthObservation[],
  fit: GrowthRecipe,
  opts: ProfitOptions = {}
): ProfitRecipe {
  const cropKey = opts.cropKey ?? fit._cropKey ?? "leafy";
  const o = {
    cropKey,
    ledPowerKw: opts.ledPowerKw ?? 4,
    areaM2: opts.areaM2 ?? PARAMS.growRoomAreaM2.value,
    roomHeightM: opts.roomHeightM ?? PARAMS.growRoomHeightM.value,
    cropPricePerKg: opts.cropPricePerKg ?? PARAMS.cropPricePerKg.value,
    co2CostPerKg: opts.co2CostPerKg ?? PARAMS.co2CostPerKg.value,
    avgTariff:
      opts.avgTariff ?? TARIFF_FLAT_GENERAL.reduce((a, b) => a + b, 0) / TARIFF_FLAT_GENERAL.length,
    externalTempC: opts.externalTempC ?? PARAMS.targetRoomTempC.value,
    contractKw: opts.contractKw ?? PARAMS.contractPowerKw.value,
  };

  const Z = obs.map((ob) => toNormalized(ob, ob.cropKey ?? cropKey));
  const bounds = zBounds(Z, true);

  // 수율 최적점 — 학습 결과를 그대로 z로 되돌린다
  const yieldZ = toNormalized(
    {
      ...(Object.fromEntries(
        fit.recipe.map((r) => [r.feature, r.optimum])
      ) as Record<GrowthFeature, number>),
      yield: 0,
    },
    cropKey
  );

  // 수익 최적점 — 수율 최적점에서 출발해 좌표별 격자 탐색
  const GRID = 41;
  const SWEEPS = 3;
  const best = [...yieldZ];
  // 출발점이 실행 불가능하면 그 이익을 기준선으로 쓸 수 없다. 계약전력을 넘는 점은
  // 언제나 빛을 더 쓰므로 이익이 높게 나오고, 그러면 어떤 실행 가능한 후보도 그 바를
  // 넘지 못해 탐색이 제자리에 머문다 — 답이 실행 불가능한 점으로 나온다.
  const startPoint = evaluate(best, fit, o);
  let bestProfit = startPoint.feasible ? startPoint.profitPerDay : -Infinity;
  for (let s = 0; s < SWEEPS; s++) {
    for (let i = 0; i < FEATURES.length; i++) {
      const [lo, hi] = bounds[i];
      for (let g = 0; g < GRID; g++) {
        const cand = [...best];
        cand[i] = lo + ((hi - lo) * g) / (GRID - 1);
        const pt = evaluate(cand, fit, o);
        if (!pt.feasible) continue;
        if (pt.profitPerDay > bestProfit) {
          bestProfit = pt.profitPerDay;
          best[i] = cand[i];
        }
      }
    }
  }

  const atYieldOptimum = evaluate(yieldZ, fit, o);
  const atProfitOptimum = evaluate(best, fit, o);
  const r2 = (v: number) => Math.round(v * 100) / 100;

  const setpoints: ProfitSetpoint[] = FEATURES.map((f) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    unit: UNIT[f],
    yieldOptimum: r2(atYieldOptimum.setpoints[f]),
    profitOptimum: r2(atProfitOptimum.setpoints[f]),
    shift: r2(atProfitOptimum.setpoints[f] - atYieldOptimum.setpoints[f]),
    costed: COSTED.includes(f),
  }));

  const foregone = atProfitOptimum.profitPerDay - atYieldOptimum.profitPerDay;
  const label = (s: ProfitSetpoint) => `${s.label} ${s.yieldOptimum}→${s.profitOptimum}${s.unit}`;
  const moved = setpoints.filter((s) => s.costed && Math.abs(s.shift) > 0.01).map(label);
  // 비용이 없는 요인도 따라 움직인다. 상호작용 때문이다 — DLI가 내려오면 그와
  // 엮인 EC의 최적점도 같이 옮겨간다. 요인을 따로따로 봤다면 놓쳤을 이동이다.
  const dragged = setpoints.filter((s) => !s.costed && Math.abs(s.shift) > 0.01).map(label);
  const draggedPart = dragged.length
    ? ` 비용이 없는 ${dragged.join(" · ")}도 따라 움직이는데, 상호작용으로 엮여 있어서다.`
    : "";

  return {
    setpoints,
    atYieldOptimum,
    atProfitOptimum,
    foregoneProfitPerDay: foregone,
    note:
      moved.length > 0
        ? `비용을 목적함수에 넣으면 ${moved.join(" · ")}로 내려온다. ` +
          `수율은 ${atYieldOptimum.yieldKgM2}→${atProfitOptimum.yieldKgM2}kg/㎡로 줄지만 ` +
          `운전비가 ${atYieldOptimum.cost.total.toLocaleString("ko-KR")}→${atProfitOptimum.cost.total.toLocaleString("ko-KR")}원/일로 더 크게 줄어 ` +
          `수익이 하루 ${foregone.toLocaleString("ko-KR")}원 늘어난다. ` +
          `수율만 쫓으면 그만큼을 매일 태운다.${draggedPart}`
        : `현 단가에서는 수율 최적점이 곧 수익 최적점이다 — 비용이 설정점을 움직일 만큼 크지 않다. ` +
          `전력·탄산 단가가 오르면 뒤집힌다.`,
  };
}
