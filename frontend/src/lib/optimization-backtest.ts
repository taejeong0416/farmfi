// ── 백테스트 · 실행 검증 ────────────────────────────────────────────────────
// 지금 리포트의 절감액은 전부 "관행이라면 이랬을 것" 대비 반사실이고, 그 관행조차
// 코드가 정한 가정(08시 점등)이다. 1호점 실측이 들어오기 전까지 이 구조는 그대로이므로,
// 최소한 **보유한 과거 데이터에서는 얼마였는지**는 확인할 수 있어야 한다.
//
// 두 가지를 한다:
//   ① 백테스트 — 과거 구간에 스케줄을 되돌려 적용해 일별 반사실 비용을 계산한다.
//      핵심은 평균이 아니라 분포다. "30일 평균 13% 절감"보다 "며칠은 절감이 0이었고
//      그 이유는 요금 평탄화"가 훨씬 방어 가능한 주장이다.
//   ② 실행 검증 — 계획한 스케줄과 실제 점등 이력을 비교한다. 이 지표 없이는
//      "AI가 절감했다"와 "운영자가 안 따랐다"를 구분할 수 없다.
//
// 이 둘이 갖춰져야 절감액의 신뢰도(projected → measured)를 올릴 수 있다.

import {
  resolveLighting,
  TARIFF_TOU_GENERAL,
  ledThermalCostPerHour,
} from "./optimization";
import { getCrop } from "./crop-profiles";
import { PARAMS } from "./optimization-params";

export interface BacktestDay {
  date: string; // YYYY-MM-DD
  samples: number; // 그날 확보된 시간 표본 수
  baselineCostPerDay: number; // 관행(08시 점등) 총비용 = 전력 + 순열
  optimizedCostPerDay: number;
  saving: number; // 총 절감 (전력 + 열)
  energySaving: number; // 그중 전력량요금분
  thermalSaving: number; // 그중 냉난방분
  savingRate: number; // 0~1
  blockStartHour: number; // 그날 최적 점등 시작시각
  extTempAvg: number | null;
}

export interface BacktestResult {
  days: BacktestDay[];
  completeDays: number;
  skippedDays: number; // 표본 부족으로 제외한 날
  meanSavingPerDay: number;
  medianSavingPerDay: number;
  /** 총 절감을 두 축으로 나눈 중앙값 — 요금 절감과 냉난방 절감은 성격이 다르다 */
  medianEnergySavingPerDay: number;
  medianThermalSavingPerDay: number;
  p10SavingPerDay: number; // 하위 10% — 나쁜 날이 얼마나 나쁜지
  worstDay: BacktestDay | null;
  nonPositiveDays: number; // 절감이 0 이하였던 날
  startHourSpread: number; // 최적 시작시각이 며칠이나 갈렸는지 (고정 스케줄로 충분한지)
  monthlySavingProjection: number; // 일 중앙값 × 30
  note: string;
}

export interface BacktestRecord {
  /** 측정시각 ISO */
  measDt: string;
  /** 실측 외기온도 ℃. 없으면 열 항은 계산하지 않는다 */
  extTemp?: number | null;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// 과거 환경 시계열에 스케줄을 되돌려 적용한다. 요금표만으로는 날마다 같은 답이 나오므로
// 그날의 실측 외기온도로 열 항까지 함께 계산해야 일별 차이가 드러난다.
export function backtestSchedule(opts: {
  records: BacktestRecord[];
  cropKey?: string;
  ledPowerKw: number;
  tariff?: number[];
  dliTarget?: number;
  /** 관행 점등 시작시각 */
  baselineStartHour?: number;
  targetTempC?: number;
}): BacktestResult {
  const tariff = opts.tariff ?? TARIFF_TOU_GENERAL;
  const baselineStart = opts.baselineStartHour ?? 8;
  const TARGET = opts.targetTempC ?? 20;
  const heatCoef = PARAMS.heatCreditPerKwh.value;
  const coolCoef = PARAMS.coolCostPerKwh.value;

  // 검증 기간 내내 같은 광량 목표를 유지했다고 보고, 그 운전점으로 배치만 비교한다.
  const plan = resolveLighting({
    cropKey: opts.cropKey,
    dliTarget: opts.dliTarget ?? getCrop(opts.cropKey).dliTarget,
    ledPowerKw: opts.ledPowerKw,
  });

  // 날짜별로 시간대 외기온도를 모은다.
  const byDate = new Map<string, (number | null)[]>();
  for (const r of opts.records) {
    const d = new Date(r.measDt);
    if (Number.isNaN(d.getTime())) continue;
    const key = r.measDt.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, Array(24).fill(null));
    const slot = byDate.get(key)!;
    slot[d.getHours()] = typeof r.extTemp === "number" ? r.extTemp : null;
  }

  const days: BacktestDay[] = [];
  let skipped = 0;

  for (const [date, extByHour] of [...byDate.entries()].sort()) {
    const samples = extByHour.filter((v) => v !== null).length;
    // 하루의 절반도 안 채워진 날은 비교 대상에서 뺀다. 부분일을 섞으면 평균이 흐려진다.
    if (samples < 12) {
      skipped += 1;
      continue;
    }
    const dayAvg =
      extByHour.reduce<number>((s, v) => s + (v ?? 0), 0) / Math.max(1, samples);
    const extAt = (h: number) => extByHour[h] ?? dayAvg;

    // 시간당 순비용 = 전력요금 + LED 발열의 순 열비용(난방 대체는 음수, 잔여열 제거는 양수).
    // 열 항은 ledThermalCostPerHour 한 곳에서만 계산한다 — 리포트의 다른 계층과 같은 물리.
    const hourCost = (h: number) =>
      plan.ledPowerKw * tariff[h] +
      ledThermalCostPerHour({
        ledPowerKw: plan.ledPowerKw,
        externalTempC: extAt(h),
        targetTempC: TARGET,
        heatCreditPerKwh: heatCoef,
        coolCostPerKwh: coolCoef,
      });
    const blockCost = (start: number) => {
      let c = 0;
      for (let i = 0; i < plan.hours; i++) c += hourCost((start + i) % 24);
      return c;
    };
    // 절감을 두 축으로 쪼개 둔다. 요금 절감(시간 이동)과 냉난방 절감(더운 시간 회피)은
    // 근거도 재현성도 달라, 합쳐서 "전력량요금 절감"이라 부르면 사실과 어긋난다.
    const blockEnergy = (start: number) => {
      let c = 0;
      for (let i = 0; i < plan.hours; i++) c += plan.ledPowerKw * tariff[(start + i) % 24];
      return c;
    };

    let bestStart = 0;
    let bestCost = Infinity;
    for (let s = 0; s < 24; s++) {
      const c = blockCost(s);
      if (c < bestCost) {
        bestCost = c;
        bestStart = s;
      }
    }
    const baseline = blockCost(baselineStart);
    const saving = baseline - bestCost;
    const energySaving = blockEnergy(baselineStart) - blockEnergy(bestStart);
    days.push({
      date,
      samples,
      baselineCostPerDay: Math.round(baseline),
      optimizedCostPerDay: Math.round(bestCost),
      saving: Math.round(saving),
      energySaving: Math.round(energySaving),
      thermalSaving: Math.round(saving - energySaving),
      savingRate: baseline !== 0 ? saving / Math.abs(baseline) : 0,
      blockStartHour: bestStart,
      extTempAvg: Math.round(dayAvg * 10) / 10,
    });
  }

  const savings = days.map((d) => d.saving).sort((a, b) => a - b);
  const mean =
    savings.length > 0 ? savings.reduce((a, b) => a + b, 0) / savings.length : 0;
  const median = quantile(savings, 0.5);
  const p10 = quantile(savings, 0.1);
  const nonPositive = savings.filter((s) => s <= 0).length;
  const energySorted = days.map((d) => d.energySaving).sort((a, b) => a - b);
  const thermalSorted = days.map((d) => d.thermalSaving).sort((a, b) => a - b);
  const starts = new Set(days.map((d) => d.blockStartHour));

  return {
    days,
    completeDays: days.length,
    skippedDays: skipped,
    meanSavingPerDay: Math.round(mean),
    medianSavingPerDay: Math.round(median),
    medianEnergySavingPerDay: Math.round(quantile(energySorted, 0.5)),
    medianThermalSavingPerDay: Math.round(quantile(thermalSorted, 0.5)),
    p10SavingPerDay: Math.round(p10),
    worstDay: days.length > 0 ? days.reduce((a, b) => (b.saving < a.saving ? b : a)) : null,
    nonPositiveDays: nonPositive,
    startHourSpread: starts.size,
    // 투영은 평균이 아니라 중앙값으로 한다 — 하루 이상치가 월 추정을 끌어올리지 않게.
    monthlySavingProjection: Math.round(median * 30),
    note:
      days.length === 0
        ? "백테스트 가능한 완전한 날이 없음 — 시간 표본이 하루 12건 이상 필요"
        : `${days.length}일 검증: 일 중앙값 ${Math.round(median)}원 (하위 10% ${Math.round(
            p10
          )}원, 절감 없던 날 ${nonPositive}일). 최적 시작시각이 ${starts.size}가지로 갈렸으므로 ${
            starts.size <= 2 ? "고정 스케줄로도 대부분 회수된다" : "일별 재계산이 필요하다"
          }.`,
  };
}

// ── 실행 검증 ───────────────────────────────────────────────────────────────

export interface AdherenceResult {
  plannedHours: number[];
  actualHours: number[];
  matchedHours: number;
  adherenceRate: number; // 0~1
  missedHours: number[]; // 계획에 있었는데 켜지 않음
  extraHours: number[]; // 계획에 없는데 켬
  verdict: "conformant" | "partial" | "non-conformant" | "no-data";
  note: string;
}

// 계획 스케줄과 실제 점등 이력을 시간대 단위로 맞춰 본다.
export function scheduleAdherence(
  plannedHours: number[],
  actualOnHours: number[]
): AdherenceResult {
  if (plannedHours.length === 0 || actualOnHours.length === 0) {
    return {
      plannedHours,
      actualHours: actualOnHours,
      matchedHours: 0,
      adherenceRate: 0,
      missedHours: [],
      extraHours: [],
      verdict: "no-data",
      note: "실행 이력 없음 — 계획 대비 준수율을 계산할 수 없다",
    };
  }
  const planned = new Set(plannedHours.map((h) => ((h % 24) + 24) % 24));
  const actual = new Set(actualOnHours.map((h) => ((h % 24) + 24) % 24));
  const matched = [...planned].filter((h) => actual.has(h));
  const missed = [...planned].filter((h) => !actual.has(h)).sort((a, b) => a - b);
  const extra = [...actual].filter((h) => !planned.has(h)).sort((a, b) => a - b);
  const rate = matched.length / planned.size;
  const verdict = rate >= 0.9 ? "conformant" : rate >= 0.6 ? "partial" : "non-conformant";

  return {
    plannedHours: [...planned].sort((a, b) => a - b),
    actualHours: [...actual].sort((a, b) => a - b),
    matchedHours: matched.length,
    adherenceRate: Math.round(rate * 100) / 100,
    missedHours: missed,
    extraHours: extra,
    verdict,
    note:
      verdict === "conformant"
        ? `계획 준수 ${Math.round(rate * 100)}% — 절감 실적을 스케줄 덕으로 볼 수 있다`
        : verdict === "partial"
          ? `계획 준수 ${Math.round(rate * 100)}% — 미점등 ${missed.length}h. 절감 미달을 알고리즘 탓으로 돌리기 전에 실행부터 확인해야 한다`
          : `계획 준수 ${Math.round(rate * 100)}% — 스케줄이 사실상 실행되지 않았다. 이 구간의 절감 주장은 성립하지 않는다`,
  };
}

// ── 신뢰도 승격 규칙 ────────────────────────────────────────────────────────
// "실측 확정치"라고 말하려면 두 가지가 함께 있어야 한다: 충분한 기간의 백테스트와,
// 계획대로 실행됐다는 증거. 둘 중 하나라도 없으면 추정치(projected)로 남는다.
// 규칙을 코드에 박아 두면 실측이 들어오는 순간 리포트가 저절로 바뀐다.
export const MEASURED_MIN_DAYS = 14;
export const MEASURED_MIN_ADHERENCE = 0.9;

export function savingsConfidence(opts: {
  backtest?: BacktestResult | null;
  adherence?: AdherenceResult | null;
}): { confidence: "measured" | "projected"; reason: string } {
  const days = opts.backtest?.completeDays ?? 0;
  const rate = opts.adherence?.adherenceRate ?? 0;
  const hasAdherence = opts.adherence != null && opts.adherence.verdict !== "no-data";

  if (days >= MEASURED_MIN_DAYS && hasAdherence && rate >= MEASURED_MIN_ADHERENCE) {
    return {
      confidence: "measured",
      reason: `백테스트 ${days}일 + 실행 준수 ${Math.round(rate * 100)}% — 실측 확정치`,
    };
  }
  const missing: string[] = [];
  if (days < MEASURED_MIN_DAYS) missing.push(`검증 기간 ${days}/${MEASURED_MIN_DAYS}일`);
  if (!hasAdherence) missing.push("실행 이력 없음");
  else if (rate < MEASURED_MIN_ADHERENCE)
    missing.push(`실행 준수 ${Math.round(rate * 100)}% < ${MEASURED_MIN_ADHERENCE * 100}%`);
  return {
    confidence: "projected",
    reason: `추정치 — ${missing.join(", ")}`,
  };
}
