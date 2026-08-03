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
  backtestSchedule,
  scheduleAdherence,
  savingsConfidence,
  type BacktestResult,
  type AdherenceResult,
} from "./optimization-backtest";
import {
  allocateCycleDli,
  optimalContractPower,
  newsvendorSeeding,
  type CycleDliPlan,
  type ContractPowerPlan,
  type NewsvendorPlan,
} from "./optimization-planning";
import { co2LightCoOptimize, type Co2LightPlan } from "./optimization-climate";
import {
  contextualCropAllocation,
  multivariateDrift,
  withConformalInterval,
  oneStepResiduals,
  type ContextualAllocation,
  type MultivariateDriftResult,
  type IntervalForecast,
} from "./optimization-learning";
import { paramTable, paramConfidence, type ParamRow, type ParamBasis } from "./optimization-params";
import { mulberry32 } from "./prng";
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
  /** 백테스트용 원시 환경 레코드 (측정시각 + 실측 외기온도). 없으면 백테스트 생략 */
  envRecords?: { measDt: string; extTemp?: number | null }[];
  /** 실제 점등된 시간대(0~23). 제어 이력이 쌓이면 넣는다 — 없으면 실행 검증 보류 */
  actualLitHours?: number[];
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
    confidenceReason: string;
    /** 파라미터 중 "가정"에 기대는 비율 */
    assumedParamShare: number;
  };
  micro: {
    dli: DliPlan;
    feedback: DliFeedback | null;
    peak: PeakPlan;
    joint: JointSchedule;
    forecast: DemandForecast;
    forecastInterval: IntervalForecast;
    seeding: SeedingPlan;
    newsvendor: NewsvendorPlan;
    recipeMix: BanditAllocation;
    nutrient: NutrientAdvice | null;
  };
  meso: {
    maintenance: MaintenanceReport | null;
    rawCusum: CusumResult[];
    weatherCusum: WeatherCompensatedResult;
    multivariate: MultivariateDriftResult;
    supplemental: SupplementalPlan;
    portfolio: MeanVariancePlan;
    contextual: ContextualAllocation;
    rul: RulResult;
  };
  /** 계획 계층 — 하루 단위 스케줄링이 못 쓰는 자유도 */
  planning: {
    cycleDli: CycleDliPlan;
    contractPower: ContractPowerPlan;
    co2Light: Co2LightPlan;
  };
  /** 검증 계층 — 절감 주장을 확인 가능하게 만드는 부분 */
  verification: {
    backtest: BacktestResult | null;
    adherence: AdherenceResult;
    params: ParamRow[];
    paramSummary: { total: number; byBasis: Record<ParamBasis, number>; assumedShare: number };
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
  // 점예측에 컨포멀 구간을 씌우고, 그 잔차 분포로 뉴스벤더 파종량까지 함께 낸다.
  // 예측을 확률로 만들면 "얼마나 심을지"가 비대칭 비용을 반영하게 된다.
  const forecast = holtWintersForecast(input.salesUnits);
  const salesResiduals = oneStepResiduals(
    input.salesUnits,
    (history) => holtWintersForecast(history).dailyForecast[0]
  );
  const forecastInterval = withConformalInterval(
    forecast.dailyForecast.slice(0, 14),
    salesResiduals
  );
  const monthlySalesForecast = input.monthlySalesForecast ?? forecast.monthlyTotal;
  const seeding = seedingPlan({ monthlySalesForecast });
  const dailyPoint =
    forecast.dailyForecast.slice(0, 30).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.min(30, forecast.dailyForecast.length));
  const newsvendor = newsvendorSeeding({
    pointForecast: dailyPoint,
    residuals: salesResiduals,
    horizonDays: 30,
  });
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
  // 센서별 독립 관리도가 놓치는 "관계 붕괴"를 다변량으로 함께 본다.
  const multivariate = multivariateDrift(readings, { lag: 24 });

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

  // ── 중간: 문맥 밴딧 — 사이트마다 다른 답 ──
  // 마코위츠가 "플릿 전체를 어떤 비율로 섞을지"를 정한다면, 문맥 밴딧은 "이 사이트에는
  // 무엇을 심을지"를 정한다. 층고·상권·계절이 다르면 같은 비율이라도 배치가 달라진다.
  const contextRand = mulberry32(31);
  const siteContexts = Array.from({ length: sites }, (_, i) => ({
    siteId: `site-${String(i + 1).padStart(2, "0")}`,
    features: [contextRand(), contextRand(), contextRand()],
    featureLabels: ["층고 여유", "상권 프리미엄 수요", "계절 적합도"],
  }));
  const contextual = contextualCropAllocation({
    sites: siteContexts,
    arms: [
      { name: "엽채류(상추)", base: 7000, weights: [200, 500, 1500] },
      { name: "바질(허브)", base: 9000, weights: [800, 4000, 500] },
      { name: "방울토마토", base: 8000, weights: [6000, 3000, 1000] },
    ],
  });

  // ── 검증 계층: 백테스트 · 실행 준수 ──
  // 절감 주장을 확인 가능하게 만드는 부분. 이것이 있어야 confidence가 올라간다.
  const backtest =
    input.envRecords && input.envRecords.length > 0
      ? backtestSchedule({
          records: input.envRecords,
          cropKey,
          ledPowerKw,
          tariff,
        })
      : null;
  const adherence = scheduleAdherence(dli.litHours, input.actualLitHours ?? []);
  const confidence = savingsConfidence({ backtest, adherence });

  // ── 계획 계층: 사이클 광량 배분 · 계약전력 · CO2-광 대체 ──
  // 사이클 배분의 일별 가격 신호는 백테스트에서 나온다. 그날의 실측 외기까지 반영된
  // 실효 단가라, 요금표만 볼 때는 보이지 않던 날짜별 차이가 생긴다.
  const kwhPerDay = ledKwUsed * dli.requiredHours;
  const dailyEffectiveTariff =
    backtest && backtest.days.length > 0
      ? backtest.days.map((d) => d.optimizedCostPerDay / Math.max(1e-6, kwhPerDay))
      : Array(crop.cycleDays).fill(
          dli.costPerDay / Math.max(1e-6, kwhPerDay)
        );
  // 광량을 하루에 몰면 그날 PPFD와 소비전력이 올라 피크가 커진다. 기본요금은 기간
  // 최대치에 붙으므로, 전력량요금에서 번 것을 기본요금에서 잃지 않도록 관행 스케줄의
  // 전력 상한 안에서 재배분한다.
  const auxSyncKw = AUX_LOADS[0].kw;
  const ledPeakBudgetKw = Math.max(ledKwUsed, peak.naivePeakKw - auxSyncKw);
  const cycleDli = allocateCycleDli({
    cropKey,
    ledPowerKw,
    dailyAvgTariff: dailyEffectiveTariff,
    maxLedPowerKw: ledPeakBudgetKw,
  });
  // 피크 분포: 사이클 배분에서 날마다 광량이 다르면 소비전력도 달라진다.
  // 공조는 LED와 동기 가동하므로 함께 피크를 만든다.
  // 관행은 전 부하가 08시에 함께 켜져 매일 같은 피크를 만든다. 최적화 후에는
  // 사이클 배분으로 날마다 광량이 달라 피크도 분포를 갖는다.
  // 날마다 광량이 다르면 그날 LED 전력도 다르고, 보조 부하를 어디에 두느냐로 피크가
  // 또 달라진다. 각 날에 부하 배치를 다시 풀어 그날의 최대수요를 구한다.
  // 관행 피크와 최적 피크를 **같은 날의 같은 부하**로 비교해야 부하 배치의 효과만
  // 남는다. 사이클 배분으로 날마다 LED 전력이 다르므로 기준선도 날마다 다시 잡는다.
  const dailyPeakPairs = cycleDli.days.map((d) => {
    const litHours = Array.from(
      { length: d.hours },
      (_, i) => (dli.litHours[0] + i) % 24
    );
    const p = peakStagger([
      { name: "LED", kw: d.ledPowerKw, hoursNeeded: d.hours, fixedHours: litHours },
      ...AUX_LOADS,
    ]);
    return { optimized: p.optimizedPeakKw, naive: p.naivePeakKw };
  });
  const contractPower = optimalContractPower({
    dailyPeaksKw: dailyPeakPairs.map((p) => p.optimized),
    baselinePeaksKw: dailyPeakPairs.map((p) => p.naive),
  });
  const co2Light = co2LightCoOptimize({ cropKey, ledPowerKw });

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
  // 광주기 절감은 백테스트에서 확인된 값을 쓰되, **전력량요금분만** 넣는다.
  // 백테스트 총절감에는 더운 시간대 회피로 줄인 냉방분이 섞여 있어, 그대로 넣으면
  // 전력량요금 레버가 실제보다 커 보인다(냉방 절감은 별도 레버로 나가야 맞다).
  const savings = operationsSavingsReport({
    dliSavingPerMonth: backtest?.completeDays
      ? backtest.medianEnergySavingPerDay * 30
      : dli.savingPerMonth,
    peakSavingPerMonth: contractPower.savingPerMonth,
    saImprovementPerMonth: joint.improvementPerMonth,
    wasteReductionUnits: seeding.expectedWasteReduction,
    dliCo2PerMonth: dli.co2SavedKgPerMonth,
    confidence: confidence.confidence,
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
      confidenceReason: confidence.reason,
      assumedParamShare: paramConfidence().assumedShare,
    },
    micro: {
      dli,
      feedback,
      peak,
      joint,
      forecast,
      forecastInterval,
      seeding,
      newsvendor,
      recipeMix,
      nutrient,
    },
    meso: {
      maintenance,
      rawCusum,
      weatherCusum,
      multivariate,
      supplemental,
      portfolio,
      contextual,
      rul,
    },
    planning: { cycleDli, contractPower, co2Light },
    verification: {
      backtest,
      adherence,
      params: paramTable(),
      paramSummary: paramConfidence(),
    },
    macro: { savings },
    advanced,
    unified,
  };
}
