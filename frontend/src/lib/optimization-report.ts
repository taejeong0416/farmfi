// ── AI 운영 최적화 리포트 조립 ──────────────────────────────────────────────
// 웹 페이지(/optimization/[id])와 API(/api/optimization/[id])가 같은 숫자를 내도록
// 파이프라인을 한 곳에서 조립한다. 두 곳이 각자 계산하면 입력이 조금씩 갈라져
// 같은 프로젝트인데 열비용 부호가 반대로 나오는 식의 불일치가 생긴다.
//
// 설계 원칙 — **없는 데이터를 지어내지 않는다.**
// 외기온도·외부일사량처럼 아직 확보하지 못한 계열은 선택 입력으로 두고, 없으면 해당
// 분석을 `unavailable`로 표시한다. 내부값에서 상수를 빼 외기를 만들어 넣으면 분석이
// 항상 "정상"만 내면서도 겉보기엔 동작하는 것처럼 보이기 때문에, 빈 값보다 위험하다.

import {
  dliSchedule,
  dliFeedback,
  maintenanceRisk,
  seedingPlan,
  nutrientAdvice,
  holtWintersForecast,
  cusumDrift,
  weatherCompensatedCusum,
  supplementalTrigger,
  peakStagger,
  annealJointSchedule,
  recipeOptimization,
  operationsSavingsReport,
  TARIFF_TOU_GENERAL,
  TARIFF_FLAT_AGRI,
  type DliPlan,
  type DliFeedback,
  type PeakPlan,
  type JointSchedule,
  type DemandForecast,
  type SeedingPlan,
  type NutrientAdvice,
  type BanditAllocation,
  type CusumResult,
  type WeatherCompensatedResult,
  type SupplementalPlan,
  type MaintenanceReport,
  type OperationsSavings,
} from "./optimization";
import { optimalStack, type OptimalStack } from "./optimization-advanced";
import {
  cropMeanVariance,
  remainingUsefulLife,
  type MeanVariancePlan,
  type RulResult,
} from "./optimization-frontier";
import { unifiedCoOptimize, type UnifiedResult } from "./optimization-unified";
import { getCrop, type CropProfile } from "./crop-profiles";
import type { IoTReading } from "./iot-health";

// 공조·양액펌프는 LED와 함께 피크를 만드는 상시 부하다. 설비 사양 확정 시 교체.
const AUX_LOADS = [
  { name: "공조", kw: 1.5, hoursNeeded: 10 },
  { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
];

// 외기 계열이 없을 때 쓰는 중립 가정. 실내 목표온도와 같게 두면 열 항이 0이 되어
// 계절 이득/부담을 어느 쪽으로도 주장하지 않는다.
const NEUTRAL_EXT_TEMP_C = 20;

export interface OptimizationReportInput {
  projectId: string;
  projectName: string;
  /** 시간 오름차순 IoT 계열 */
  readings: IoTReading[];
  /** 실측 외기온도(℃). readings와 같은 길이·같은 시각으로 정렬해 넘긴다. 없으면 생략 */
  externalTempC?: (number | null | undefined)[];
  /** 실측 외부일사량(W/m²). 없으면 생략 */
  externalInsolationWm2?: (number | null | undefined)[];
  /** 일별 판매량 시계열 */
  salesUnits: number[];
  /** 플릿 베이스라인(신규 사이트 콜드스타트용 사전분포) */
  fleetPrior?: { median: number; mad: number };
  cropKey?: string;
  tariffKey?: "tou" | "agri";
  ledPowerKw?: number;
  indoor?: boolean;
  monthlySalesForecast?: number;
  sites?: number;
}

export interface OptimizationReport {
  project: { id: string; name: string };
  crop: Pick<CropProfile, "key" | "label" | "dliTarget">;
  inputs: {
    cropKey: string;
    tariff: "tou" | "agri";
    ledPowerKw: number;
    indoor: boolean;
    sites: number;
    monthlySalesForecast: number;
    iotRecords: number;
    salesRecords: number;
  };
  /** 각 분석이 실측에 근거하는지, 가정으로 대체됐는지 */
  dataAvailability: {
    externalTemp: "measured" | "assumed";
    externalInsolation: "measured" | "assumed";
    savingsConfidence: "measured" | "projected";
  };
  micro: {
    dli: DliPlan;
    feedback: DliFeedback | null;
    peak: PeakPlan;
    joint: JointSchedule;
    forecast: DemandForecast;
    seeding: SeedingPlan;
    recipeMix: BanditAllocation;
    nutrient: NutrientAdvice | null;
  };
  meso: {
    maintenance: MaintenanceReport | null;
    rawCusum: CusumResult[];
    weatherCusum: WeatherCompensatedResult;
    supplemental: SupplementalPlan;
    portfolio: MeanVariancePlan;
    rul: RulResult;
  };
  macro: { savings: OperationsSavings };
  advanced: OptimalStack;
  unified: UnifiedResult;
}

// 마지막 24개 표본을 뽑되, 짧으면 있는 만큼만. 시간대 인덱스가 필요한 계열용.
function tail24(values: number[], fallback: number): number[] {
  const t = values.slice(-24);
  while (t.length < 24) t.unshift(fallback);
  return t;
}

export function buildOptimizationReport(
  input: OptimizationReportInput
): OptimizationReport {
  const cropKey = input.cropKey ?? "leafy";
  const crop = getCrop(cropKey);
  const tariffKey = input.tariffKey ?? "tou";
  const tariff = tariffKey === "agri" ? TARIFF_FLAT_AGRI : TARIFF_TOU_GENERAL;
  const ledPowerKw = input.ledPowerKw ?? 4;
  const indoor = input.indoor ?? true;
  const sites = input.sites ?? 20;
  const readings = input.readings;

  // ── 실측 외기 계열 정리: 값이 하나라도 비면 가정으로 취급한다 ──
  const extTempRaw = (input.externalTempC ?? []).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  const hasExtTemp = extTempRaw.length >= 12;
  const extInsolationRaw = (input.externalInsolationWm2 ?? []).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  const hasExtInsolation = extInsolationRaw.length >= 24;

  const ext24 = hasExtTemp
    ? tail24(extTempRaw, NEUTRAL_EXT_TEMP_C)
    : Array(24).fill(NEUTRAL_EXT_TEMP_C);

  // ── 미시 ① DLI 광주기 (광주기 안전 하드제약 + TOU + 탄소) ──
  const dli = dliSchedule({ cropKey, ledPowerKw, tariff });
  // 시간 압축으로 PPFD가 오르면 소비전력도 오른다. 아래 부하 계산은 그 운전점을 쓴다.
  const ledKwUsed = dli.ledPowerKwUsed;
  const feedback =
    readings.length > 0
      ? dliFeedback({
          cropKey,
          recentLux: readings.slice(-24).map((r) => r.lightIntensity),
        })
      : null;

  // ── 미시 ② 피크 분산(기본요금) + SA 통합 전역탐색 ──
  const peak = peakStagger([
    {
      name: "LED",
      kw: ledKwUsed,
      hoursNeeded: dli.requiredHours,
      fixedHours: dli.litHours,
    },
    ...AUX_LOADS,
  ]);
  const joint = annealJointSchedule({
    ledPowerKw: ledKwUsed,
    photoperiodHours: dli.requiredHours,
    tariff,
    flexLoads: AUX_LOADS,
  });

  // ── 미시 ④ 수요예측 → 파종 ──
  const forecast = holtWintersForecast(input.salesUnits);
  const monthlySalesForecast = input.monthlySalesForecast ?? forecast.monthlyTotal;
  const seeding = seedingPlan({ monthlySalesForecast });
  const nutrient =
    readings.length > 0
      ? nutrientAdvice(readings[readings.length - 1], cropKey)
      : null;

  // ── 미시 ⑤ 밴딧: 고정 품목 안에서 품종/재배 레시피 탐색 ──
  const recipeMix = recipeOptimization();

  // ── 중간: 예지보전 ──
  const maintenance = readings.length > 0 ? maintenanceRisk(readings) : null;
  const rawCusum = cusumDrift(readings, { lag: 24 });
  const weatherCusum = hasExtTemp
    ? weatherCompensatedCusum(
        readings.map((r) => r.temperature).slice(-extTempRaw.length),
        extTempRaw.slice(-readings.length),
        { fleetPrior: input.fleetPrior }
      )
    : ({
        status: "insufficient-data",
        detected: false,
        detectedIndex: null,
        maxStatistic: 0,
        baselineDiff: 0,
        usedFleetPrior: false,
        note: "실측 외기온도 미확보 — 내외기 차분 판정 보류(내부값 파생 대체는 쓰지 않음)",
      } satisfies WeatherCompensatedResult);
  const rul = remainingUsefulLife({
    degradationIndex: maintenance ? Math.min(0.95, maintenance.riskScore / 6) : 0,
  });

  // ── 중간: 보광 트리거(실내 vs 온실 하이브리드) ──
  const supplemental = supplementalTrigger({
    cropKey,
    hourlyInsolation: hasExtInsolation ? tail24(extInsolationRaw, 0) : Array(24).fill(0),
    indoor: indoor || !hasExtInsolation,
  });

  // ── 중간: 사이트 간 품목 배분 — 마코위츠 평균-분산 ──
  // 배분 결정은 이 한 곳에서만 낸다. 밴딧(recipeMix)은 사이트 안의 품종·레시피 탐색용.
  const portfolio = cropMeanVariance({
    assets: [
      { name: "엽채류(상추)", expectedMargin: 7000, volatility: 1800 },
      { name: "바질(허브)", expectedMargin: 11000, volatility: 3500 },
      { name: "방울토마토", expectedMargin: 14000, volatility: 6000 },
    ],
  });

  // ── 고도화 스택 · 통합 공동최적화 ──
  const advanced = optimalStack({
    cropKey,
    ledPowerKw,
    sites,
    hourlyExtTemp: ext24,
    tariff,
  });
  const unified = unifiedCoOptimize({
    cropKey,
    ledPowerKw,
    hourlyExtTemp: ext24,
    tariff,
  });

  // ── 거시: 재무 환산 ──
  const savings = operationsSavingsReport({
    dliSavingPerMonth: dli.savingPerMonth,
    peakSavingPerMonth: peak.demandChargeSavingPerMonth,
    saImprovementPerMonth: joint.improvementPerMonth,
    wasteReductionUnits: seeding.expectedWasteReduction,
    dliCo2PerMonth: dli.co2SavedKgPerMonth,
    confidence: "projected", // 1호점 실측 확보 전까지 상방 추정치
  });

  return {
    project: { id: input.projectId, name: input.projectName },
    crop: { key: crop.key, label: crop.label, dliTarget: crop.dliTarget },
    inputs: {
      cropKey,
      tariff: tariffKey,
      ledPowerKw,
      indoor,
      sites,
      monthlySalesForecast,
      iotRecords: readings.length,
      salesRecords: input.salesUnits.length,
    },
    dataAvailability: {
      externalTemp: hasExtTemp ? "measured" : "assumed",
      externalInsolation: hasExtInsolation ? "measured" : "assumed",
      savingsConfidence: savings.confidence,
    },
    micro: { dli, feedback, peak, joint, forecast, seeding, recipeMix, nutrient },
    meso: { maintenance, rawCusum, weatherCusum, supplemental, portfolio, rul },
    macro: { savings },
    advanced,
    unified,
  };
}
