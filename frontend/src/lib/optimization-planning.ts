// ── 계획 계층 최적화 ────────────────────────────────────────────────────────
// 하루짜리 스케줄링이 못 쓰는 자유도를 푼다.
//   ① 사이클 단위 광량 배분 — 엽채류 수율은 사이클 누적 광량에 반응하므로, 요금이 싼
//      날에 더 주고 비싼 날 덜 줘도 된다. 하루 단위 최적화는 이 여지를 통째로 버린다.
//   ② 계약전력 — 기본요금은 계약전력에 붙는다. 피크를 낮췄으면 계약도 낮춰야 절감이
//      실현되는데, 너무 낮추면 초과 위약이 붙는다. 그 균형점을 푼다.
//   ③ 파종량 — 과소생산(못 판 기회)과 과대생산(폐기)의 비용이 다르다. 점예측을
//      손실률로 나누는 계산은 이 비대칭을 반영하지 못한다.

import { resolveLighting } from "./optimization";
import { getCrop } from "./crop-profiles";
import { PARAMS } from "./optimization-params";

// ── ① 사이클 단위 광량 배분 ────────────────────────────────────────────────
// 하루 비용은 그날 광량에 선형이다(전력량 kWh ∝ DLI). 그러면 "누적 광량을 채우되
// 총비용 최소"는 연속 배낭 문제가 되고, 최적해는 **싼 날부터 상한까지 채우는 것**이다.
// 탐색이 필요 없는 정확해라 근사·메타휴리스틱을 쓸 이유가 없다.
//
// 하드 제약: 매일 dailyMin 이상(생육 정지 방지), dailyMax 이하(광주기·정격).
// dailyMax는 작물 프로파일의 최대 명기 × 정격 PPFD로 물리적으로 정해진다.

export interface CycleDliDay {
  dayIndex: number;
  avgTariff: number;
  dli: number;
  ledPowerKw: number;
  hours: number;
  costPerDay: number;
}

export interface CycleDliPlan {
  days: CycleDliDay[];
  cumulativeDli: number;
  targetCumulativeDli: number;
  dailyMin: number;
  dailyMax: number;
  totalCost: number;
  uniformTotalCost: number; // 매일 같은 DLI를 준 경우
  savingPerCycle: number;
  feasible: boolean;
  note: string;
}

export function allocateCycleDli(opts: {
  cropKey?: string;
  ledPowerKw: number;
  /** 사이클 각 날의 평균 요금(원/kWh). 길이가 곧 사이클 일수 */
  dailyAvgTariff: number[];
  /** 사이클 누적 목표 광량. 없으면 작물 목표 DLI × 일수 */
  targetCumulativeDli?: number;
  /** 하루 최소 광량 — 생육이 멈추지 않는 하한 */
  dailyMinDli?: number;
  /**
   * 하루 LED 소비전력 상한(kW). 광량을 하루에 몰면 PPFD가 올라 그날 피크가 커지고,
   * 기본요금은 기간 최대치에 붙으므로 전력량요금 절감이 기본요금 상승으로 상쇄될 수
   * 있다. 계약전력 안에서 재배분하려면 이 상한을 준다.
   */
  maxLedPowerKw?: number;
}): CycleDliPlan {
  const crop = getCrop(opts.cropKey);
  const n = opts.dailyAvgTariff.length;
  const target = opts.targetCumulativeDli ?? crop.dliTarget * n;
  const dailyMin = opts.dailyMinDli ?? Math.max(4, Math.round(crop.dliTarget * 0.6));

  // 물리 상한: 최대 명기 × 정격 PPFD로 만들 수 있는 하루 최대 광량
  const physicalMax =
    Math.floor(((crop.maxPpfd * 3600) / 1e6) * crop.maxPhotoperiodH * 10) / 10;
  // 전력 상한이 주어지면 그 전력으로 낼 수 있는 광량까지만 허용한다.
  // 소비전력은 설계 PPFD 대비 비례하므로 DLI도 같은 비율로 제한된다.
  const powerMax =
    opts.maxLedPowerKw != null
      ? Math.floor(
          ((opts.maxLedPowerKw / opts.ledPowerKw) * crop.ppfd * 3600 * crop.maxPhotoperiodH) /
            1e6 *
            10
        ) / 10
      : Infinity;
  const dailyMax = Math.max(dailyMin, Math.min(physicalMax, powerMax));

  // 하루 1 DLI를 만드는 데 드는 전력량(kWh). 설계 운전점에서 kWh = kW × 명기이고
  // PPFD × 명기 ∝ DLI이므로 광량 1단위당 kWh는 일정하다.
  const ref = resolveLighting({
    cropKey: opts.cropKey,
    dliTarget: crop.dliTarget,
    ledPowerKw: opts.ledPowerKw,
  });
  const kwhPerDli = (ref.ledPowerKw * ref.hours) / ref.achievedDli;

  const feasible = target >= dailyMin * n && target <= dailyMax * n;
  const clampedTarget = Math.min(Math.max(target, dailyMin * n), dailyMax * n);

  // 싼 날부터 상한까지 채운다 — 연속 배낭의 정확해.
  const dli = Array(n).fill(dailyMin);
  let remaining = clampedTarget - dailyMin * n;
  const order = [...Array(n).keys()].sort(
    (a, b) => opts.dailyAvgTariff[a] - opts.dailyAvgTariff[b]
  );
  for (const i of order) {
    if (remaining <= 0) break;
    const room = dailyMax - dailyMin;
    const add = Math.min(room, remaining);
    dli[i] += add;
    remaining -= add;
  }

  // 총비용은 반올림 전 값으로 합산한다. 일별로 반올림한 뒤 더하면 요금이 평탄할 때도
  // 균등 배분과 몇 원씩 어긋나 "가격차가 없는데 절감이 났다"처럼 보인다.
  const exactCost = (d: number, i: number) => d * kwhPerDli * opts.dailyAvgTariff[i];
  const days: CycleDliDay[] = dli.map((d, i) => {
    const light = resolveLighting({
      cropKey: opts.cropKey,
      dliTarget: d,
      ledPowerKw: opts.ledPowerKw,
    });
    return {
      dayIndex: i,
      avgTariff: opts.dailyAvgTariff[i],
      dli: Math.round(d * 10) / 10,
      ledPowerKw: Math.round(light.ledPowerKw * 100) / 100,
      hours: light.hours,
      costPerDay: Math.round(exactCost(d, i)),
    };
  });

  const totalCostExact = dli.reduce((s, d, i) => s + exactCost(d, i), 0);
  const uniformDli = clampedTarget / n;
  const uniformCostExact = opts.dailyAvgTariff.reduce(
    (s, t) => s + uniformDli * kwhPerDli * t,
    0
  );
  const totalCost = Math.round(totalCostExact);
  const uniformTotalCost = Math.round(uniformCostExact);

  return {
    days,
    cumulativeDli: Math.round(dli.reduce((a, b) => a + b, 0) * 10) / 10,
    targetCumulativeDli: Math.round(clampedTarget * 10) / 10,
    dailyMin,
    dailyMax,
    totalCost,
    uniformTotalCost,
    // `|| 0`은 -0을 지운다 — 절감이 없을 때 화면에 "-0원"이 뜨지 않게.
    savingPerCycle: Math.round(uniformCostExact - totalCostExact) || 0,
    feasible,
    note: !feasible
      ? `누적 목표 ${Math.round(target)}가 하루 한계(${dailyMin}~${dailyMax}) × ${n}일 범위 밖 — 목표를 ${Math.round(clampedTarget)}로 잘라 계산했다`
      : `${n}일 누적 ${Math.round(clampedTarget)} mol을 요금 싼 날에 몰아 배분 — 균등 배분 대비 사이클당 ${
          uniformTotalCost - totalCost
        }원. 매일 같은 광량을 줘야 할 이유는 없다(수율은 누적 광량에 반응).`,
  };
}

// ── ② 계약전력 최적화 ──────────────────────────────────────────────────────
// 기본요금은 계약전력에 붙고, 최대수요가 계약을 넘으면 그 초과분에 할증이 붙는다.
// 여기서 중요한 건 **기간 최대치**다 — 한 달에 하루만 넘겨도 그 달 기본요금이 오르므로,
// 초과분의 평균으로 위약을 매기면 계약을 위험하게 낮게 잡는다(초과 확률 50%대의
// 권고가 나온다). 기간 최대 초과분으로 매겨야 실제 청구서와 같은 방향이 된다.
//
// 절감의 실체는 "위험을 감수해 계약을 깎는 것"이 아니라 **피크를 낮춰 필요한 계약이
// 줄어든 것**이다. 그래서 관행 스케줄의 피크 분포와 최적화 후 피크 분포를 함께 받아
// 두 계약전력의 차이로 절감을 낸다.

export interface ContractPowerPlan {
  recommendedKw: number;
  currentKw: number;
  observedPeakKw: number;
  basicChargePerMonth: number;
  penaltyPerMonth: number;
  totalPerMonth: number;
  currentTotalPerMonth: number;
  savingPerMonth: number;
  exceedanceProbability: number; // 권고 계약전력을 넘기는 날의 비율
  maxExceedanceKw: number; // 그 초과가 얼마나 큰지 — 비율만으로는 판단할 수 없다
  note: string;
}

/** 계약전력 판정 여유(kW). 반올림 수준의 초과를 위험으로 세지 않는다 */
const CONTRACT_TOLERANCE_KW = 0.05;

export function optimalContractPower(opts: {
  /** 최적화 후 일별 최대수요 kW */
  dailyPeaksKw: number[];
  /** 관행 스케줄의 일별 최대수요 kW. 주면 두 계약의 차이로 절감을 낸다 */
  baselinePeaksKw?: number[];
  /** 현재 계약전력. baselinePeaksKw가 있으면 그쪽이 우선 */
  currentContractKw?: number;
  basicChargePerKw?: number;
  penaltyMultiplier?: number;
}): ContractPowerPlan {
  const peaks = opts.dailyPeaksKw.filter((p) => Number.isFinite(p) && p > 0);
  const basic = opts.basicChargePerKw ?? PARAMS.demandChargePerKw.value;
  const penalty = opts.penaltyMultiplier ?? PARAMS.contractPenaltyMultiplier.value;

  if (peaks.length === 0) {
    const fallback = opts.currentContractKw ?? 0;
    return {
      recommendedKw: fallback,
      currentKw: fallback,
      observedPeakKw: 0,
      basicChargePerMonth: Math.round(fallback * basic),
      penaltyPerMonth: 0,
      totalPerMonth: Math.round(fallback * basic),
      currentTotalPerMonth: Math.round(fallback * basic),
      savingPerMonth: 0,
      exceedanceProbability: 0,
      maxExceedanceKw: 0,
      note: "피크 이력 없음 — 계약전력 판단 보류",
    };
  }

  // 총비용(C) = C × 단가 + max(0, 기간최대 − C) × 단가 × 위약배수
  const costOf = (c: number, series: number[]) => {
    const maxExceed = Math.max(0, Math.max(...series) - c);
    return c * basic + maxExceed * basic * penalty;
  };
  const bestContractFor = (series: number[]) => {
    const cap = Math.ceil(Math.max(...series)) + 1;
    let bestKw = cap;
    let bestCost = Infinity;
    for (let c = 0.5; c <= cap; c += 0.5) {
      const cost = costOf(c, series);
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        bestKw = c;
      }
    }
    return { kw: bestKw, cost: bestCost };
  };

  const observedMax = Math.max(...peaks);
  const best = bestContractFor(peaks);
  const baseline = opts.baselinePeaksKw?.filter((p) => Number.isFinite(p) && p > 0);
  const current =
    baseline && baseline.length > 0
      ? bestContractFor(baseline)
      : {
          kw: opts.currentContractKw ?? Math.ceil(observedMax),
          cost: costOf(opts.currentContractKw ?? Math.ceil(observedMax), peaks),
        };

  const exceedProb =
    peaks.filter((p) => p > best.kw + CONTRACT_TOLERANCE_KW).length / peaks.length;
  const maxExceed = Math.max(0, observedMax - best.kw);
  const basicCharge = best.kw * basic;

  return {
    recommendedKw: Math.round(best.kw * 10) / 10,
    currentKw: Math.round(current.kw * 10) / 10,
    observedPeakKw: Math.round(observedMax * 10) / 10,
    basicChargePerMonth: Math.round(basicCharge),
    penaltyPerMonth: Math.round(best.cost - basicCharge),
    totalPerMonth: Math.round(best.cost),
    currentTotalPerMonth: Math.round(current.cost),
    savingPerMonth: Math.max(0, Math.round(current.cost - best.cost)),
    exceedanceProbability: Math.round(exceedProb * 100) / 100,
    maxExceedanceKw: Math.round(maxExceed * 100) / 100,
    note: `관측 피크 ${Math.round(observedMax * 10) / 10}kW → 계약전력 ${
      Math.round(current.kw * 10) / 10
    }kW에서 ${Math.round(best.kw * 10) / 10}kW로 (초과 확률 ${Math.round(
      exceedProb * 100
    )}%), 월 ${Math.max(0, Math.round(current.cost - best.cost))}원. 한 달에 하루만 넘겨도 그 달 기본요금이 오르므로 기간 최대치를 기준으로 잡는다.`,
  };
}

// ── ③ 뉴스벤더 파종량 ──────────────────────────────────────────────────────
// 못 판 손실(기회 마진)과 남긴 손실(변동비)은 크기가 다르다. 최적 재고는 평균이
// 아니라 **임계 분위수** Cu/(Cu+Co)에 해당하는 수요다. 마진이 변동비보다 크면
// 임계 분위수가 0.5를 넘어 평균보다 많이 심는 게 최적이 된다.
// 분위수는 예측 잔차의 경험분포에서 뽑는다 — 정규성 가정이 필요 없다.

export interface NewsvendorPlan {
  recommendedUnits: number;
  deterministicUnits: number; // 점예측 ÷ (1−손실률) 방식
  criticalFractile: number;
  demandQuantile: number;
  capacityUnits: number;
  capped: boolean;
  expectedShortageUnits: number;
  expectedSurplusUnits: number;
  note: string;
}

export function newsvendorSeeding(opts: {
  /** 일 판매 점예측 (포기/일) */
  pointForecast: number;
  /** 한 발 앞 예측 잔차 표본 (실측 − 예측), 일 단위 */
  residuals: number[];
  /** 계획 기간(일). 일 단위 분위수를 이 기간만큼 적용한다 */
  horizonDays?: number;
  /** 포기당 판매 마진(못 팔면 잃는 것) */
  unitMargin?: number;
  /** 포기당 변동비(남기면 잃는 것) */
  unitVariableCost?: number;
  /** 계획 기간 전체의 생산능력 */
  capacityUnits?: number;
  lossRate?: number;
}): NewsvendorPlan {
  const co = opts.unitVariableCost ?? PARAMS.unitVariableCost.value;
  // 못 판 손실 = 놓친 공헌이익(직판가 − 변동비). 남긴 손실 = 이미 쓴 변동비.
  const cu = opts.unitMargin ?? Math.max(1, PARAMS.unitSalePrice.value - co);
  const capacity = opts.capacityUnits ?? 500;
  const loss = opts.lossRate ?? 0.08;
  const horizon = opts.horizonDays ?? 30;

  const fractile = cu / (cu + co);
  // 잔차 경험분위수 — 표본이 없으면 점예측을 그대로 쓴다.
  const res = opts.residuals.filter((r) => Number.isFinite(r)).sort((a, b) => a - b);
  let quantileShift = 0;
  if (res.length >= 5) {
    const idx = (res.length - 1) * fractile;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    quantileShift = lo === hi ? res[lo] : res[lo] + (res[hi] - res[lo]) * (idx - lo);
  }
  const dailyQuantile = Math.max(0, opts.pointForecast + quantileShift);
  // 일 단위 분위수를 기간 전체에 그대로 적용한다. 날마다 오차가 독립이면 합계의
  // 상대변동은 √n으로 줄어 이보다 덜 심어도 되지만, 수요가 요일·날씨로 함께 움직이는
  // 쪽이 현실이라 보수적인 이 읽기를 택한다.
  const demandQuantile = dailyQuantile * horizon;
  const raw = Math.ceil(demandQuantile / (1 - loss));
  const recommended = Math.min(capacity, raw);
  const deterministic = Math.min(
    capacity,
    Math.ceil((opts.pointForecast * horizon) / (1 - loss))
  );

  // 권고량 기준 기대 부족·잉여 (잔차 경험분포 위에서, 일 단위 환산)
  const soldPerDay = (recommended * (1 - loss)) / horizon;
  const shortage =
    res.length > 0
      ? (res.reduce((s, r) => s + Math.max(0, opts.pointForecast + r - soldPerDay), 0) /
          res.length) *
        horizon
      : 0;
  const surplus =
    res.length > 0
      ? (res.reduce((s, r) => s + Math.max(0, soldPerDay - (opts.pointForecast + r)), 0) /
          res.length) *
        horizon
      : 0;

  return {
    recommendedUnits: recommended,
    deterministicUnits: deterministic,
    criticalFractile: Math.round(fractile * 100) / 100,
    demandQuantile: Math.round(demandQuantile),
    capacityUnits: capacity,
    capped: raw > capacity,
    expectedShortageUnits: Math.round(shortage),
    expectedSurplusUnits: Math.round(surplus),
    note:
      res.length < 5
        ? `예측 잔차 표본 ${res.length}건 — 분포 추정에 부족해 점예측을 그대로 사용(결정론과 동일)`
        : `임계 분위수 ${Math.round(fractile * 100)}% (마진 ${Math.round(cu)}원 vs 변동비 ${co}원) → 수요 ${Math.round(
            demandQuantile
          )}포기 대비 ${recommended}포기 파종. 결정론 대비 ${
            recommended - deterministic >= 0 ? "+" : ""
          }${recommended - deterministic}포기 — ${
            fractile > 0.5 ? "못 파는 손실이 더 커서 넉넉히" : "폐기 손실이 더 커서 보수적으로"
          } 잡는다.`,
  };
}
