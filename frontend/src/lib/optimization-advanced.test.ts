// 계획·검증·학습 계층 회귀 테스트 — 실행: npm test
//
// 기본 엔진 테스트(optimization.test.ts)가 "농학·물리 제약이 안 깨지는가"를 본다면,
// 여기서는 새로 붙인 계층이 **주장을 과장하지 않는가**를 본다.
//   · 검증 없이 실측이라 말하지 않는다
//   · 최적화라면 비교 기준보다 나빠지지 않는다
//   · 판정 불가는 다변량에서도 판정 불가로 남는다
//   · 예측 구간은 표본이 부족하면 만들지 않는다

import test from "node:test";
import assert from "node:assert/strict";

import {
  backtestSchedule,
  scheduleAdherence,
  savingsConfidence,
  MEASURED_MIN_DAYS,
} from "./optimization-backtest";
import {
  allocateCycleDli,
  optimalContractPower,
  newsvendorSeeding,
} from "./optimization-planning";
import { co2LightCoOptimize, co2YieldFactor, CO2_AMBIENT_PPM } from "./optimization-climate";
import {
  multivariateDrift,
  conformalHalfWidth,
  withConformalInterval,
  initLinUcb,
  linUcbSelect,
  linUcbUpdate,
  contextualCropAllocation,
} from "./optimization-learning";
import { paramTable, paramConfidence } from "./optimization-params";
import { getCrop } from "./crop-profiles";
import { resolveLighting } from "./optimization";
import type { IoTReading } from "./iot-health";

const LED_KW = 4;

// 시간별 외기온도를 가진 합성 기록 n일치. 날마다 기온 수준이 달라 절감이 갈린다.
function envRecords(days: number, baseTemp = 15): { measDt: string; extTemp: number }[] {
  const out: { measDt: string; extTemp: number }[] = [];
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const day = String(d + 1).padStart(2, "0");
      out.push({
        measDt: `2026-03-${day}T${String(h).padStart(2, "0")}:00:00+09:00`,
        extTemp: baseTemp + Math.sin((d / 4) * Math.PI) * 6 + Math.sin((h / 24) * 2 * Math.PI) * 4,
      });
    }
  }
  return out;
}

// ── 검증 계층 ──────────────────────────────────────────────────────────────

test("backtest: 최적 배치는 관행 배치보다 나쁘지 않다", () => {
  const r = backtestSchedule({ records: envRecords(20), cropKey: "leafy", ledPowerKw: LED_KW });
  assert.equal(r.completeDays, 20);
  assert.ok(r.days.every((d) => d.saving >= 0), "관행보다 비싼 날이 나왔다");
  // 중앙값 투영은 평균이 아니라 중앙값 × 30 — 이상치가 월 추정을 끌어올리지 않게
  assert.equal(r.monthlySavingProjection, r.medianSavingPerDay * 30);
  assert.ok(r.p10SavingPerDay <= r.medianSavingPerDay);
});

test("backtest: 표본이 부족한 날은 평균에 섞지 않고 제외한다", () => {
  const recs = envRecords(3);
  // 마지막 날의 표본을 6건만 남긴다
  const trimmed = recs.filter((r) => !r.measDt.startsWith("2026-03-03") || Number(r.measDt.slice(11, 13)) < 6);
  const r = backtestSchedule({ records: trimmed, cropKey: "leafy", ledPowerKw: LED_KW });
  assert.equal(r.completeDays, 2);
  assert.equal(r.skippedDays, 1);
});

test("실행 이력이 없으면 실측이라 말하지 않는다", () => {
  const backtest = backtestSchedule({
    records: envRecords(MEASURED_MIN_DAYS + 5),
    cropKey: "leafy",
    ledPowerKw: LED_KW,
  });
  const noHistory = savingsConfidence({ backtest, adherence: scheduleAdherence([0, 1, 2], []) });
  assert.equal(noHistory.confidence, "projected");
  assert.match(noHistory.reason, /실행 이력 없음/);

  // 검증 기간과 준수율이 모두 충족되면 승격한다
  const planned = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const promoted = savingsConfidence({
    backtest,
    adherence: scheduleAdherence(planned, planned),
  });
  assert.equal(promoted.confidence, "measured");
});

test("실행 준수율이 낮으면 절감 주장을 성립시키지 않는다", () => {
  const a = scheduleAdherence([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2]);
  assert.equal(a.verdict, "non-conformant");
  assert.equal(a.missedHours.length, 7);
  assert.ok(a.adherenceRate < 0.6);
  const c = savingsConfidence({ backtest: null, adherence: a });
  assert.equal(c.confidence, "projected");
});

test("파라미터 표는 모든 값에 근거를 붙인다", () => {
  const rows = paramTable();
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(["고시", "추정", "가정"].includes(r.basis), `${r.key}: 근거 없음`);
    assert.ok(r.source.length > 0, `${r.key}: 출처 없음`);
    assert.ok(r.display.length > 0);
  }
  const summary = paramConfidence();
  assert.equal(
    summary.byBasis["고시"] + summary.byBasis["추정"] + summary.byBasis["가정"],
    summary.total
  );
});

// ── 계획 계층 ──────────────────────────────────────────────────────────────

test("사이클 광량 배분: 누적 목표를 지키고 균등보다 싸다", () => {
  const crop = getCrop("leafy");
  // 앞 절반이 싼 요금, 뒤 절반이 비싼 요금
  const tariffs = Array.from({ length: 28 }, (_, i) => (i < 14 ? 100 : 200));
  const plan = allocateCycleDli({ cropKey: "leafy", ledPowerKw: LED_KW, dailyAvgTariff: tariffs });

  assert.ok(Math.abs(plan.cumulativeDli - plan.targetCumulativeDli) < 0.5, "누적 광량이 목표에서 벗어남");
  assert.ok(plan.days.every((d) => d.dli >= plan.dailyMin - 1e-9), "하루 최소 광량 위반");
  assert.ok(plan.days.every((d) => d.dli <= plan.dailyMax + 1e-9), "하루 최대 광량 위반");
  assert.ok(plan.totalCost <= plan.uniformTotalCost, "균등 배분보다 비싸다");
  // 싼 날에 더 준다
  const cheapAvg = plan.days.slice(0, 14).reduce((s, d) => s + d.dli, 0) / 14;
  const pricyAvg = plan.days.slice(14).reduce((s, d) => s + d.dli, 0) / 14;
  assert.ok(cheapAvg > pricyAvg, "요금이 싼 날에 광량을 더 주지 않았다");
  // 배분된 모든 날이 물리적으로 실행 가능해야 한다
  for (const d of plan.days) {
    const light = resolveLighting({ cropKey: "leafy", dliTarget: d.dli, ledPowerKw: LED_KW });
    assert.ok(light.feasible, `DLI ${d.dli}가 정격 초과`);
    assert.ok(light.hours <= crop.maxPhotoperiodH);
  }
});

test("사이클 광량 배분: 요금이 평탄하면 균등과 같아진다", () => {
  const flat = Array(28).fill(130);
  const plan = allocateCycleDli({ cropKey: "leafy", ledPowerKw: LED_KW, dailyAvgTariff: flat });
  assert.equal(plan.savingPerCycle, 0, "가격차가 없는데 절감이 생겼다");
});

test("계약전력: 초과 위약을 감안해도 총비용이 현행보다 낮다", () => {
  // 대부분 5kW 근처인데 며칠만 8kW로 튀는 분포
  const peaks = [...Array(27).fill(5.0), 8.0, 8.2, 7.9];
  const plan = optimalContractPower({ dailyPeaksKw: peaks, currentContractKw: 9 });
  assert.ok(plan.recommendedKw <= 9);
  assert.ok(plan.totalPerMonth <= plan.currentTotalPerMonth);
  assert.ok(plan.savingPerMonth >= 0);
  assert.ok(plan.exceedanceProbability >= 0 && plan.exceedanceProbability <= 1);
});

test("계약전력: 피크 이력이 없으면 판단을 보류한다", () => {
  const plan = optimalContractPower({ dailyPeaksKw: [], currentContractKw: 6 });
  assert.equal(plan.savingPerMonth, 0);
  assert.match(plan.note, /보류/);
});

test("뉴스벤더: 마진이 크면 결정론보다 많이, 작으면 적게 심는다", () => {
  const residuals = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 6);
  const highMargin = newsvendorSeeding({
    pointForecast: 15,
    residuals,
    unitMargin: 3000,
    unitVariableCost: 500,
    capacityUnits: 100000,
  });
  const lowMargin = newsvendorSeeding({
    pointForecast: 15,
    residuals,
    unitMargin: 200,
    unitVariableCost: 2000,
    capacityUnits: 100000,
  });
  assert.ok(highMargin.criticalFractile > 0.5);
  assert.ok(lowMargin.criticalFractile < 0.5);
  assert.ok(
    highMargin.recommendedUnits > lowMargin.recommendedUnits,
    "비용 비대칭이 파종량에 반영되지 않았다"
  );
});

test("뉴스벤더: 잔차 표본이 부족하면 결정론과 같아진다", () => {
  const plan = newsvendorSeeding({ pointForecast: 15, residuals: [1, -1], capacityUnits: 100000 });
  assert.equal(plan.recommendedUnits, plan.deterministicUnits);
  assert.match(plan.note, /부족/);
});

test("CO2-광: 시비가 광량을 대체하고, 대체 없이도 이익이 줄지 않는다", () => {
  assert.equal(co2YieldFactor(CO2_AMBIENT_PPM), 1);
  assert.ok(co2YieldFactor(1000) > 1, "CO2를 올렸는데 수율 계수가 안 올랐다");

  const cheap = co2LightCoOptimize({ cropKey: "leafy", ledPowerKw: LED_KW, co2CostPerKg: 50 });
  assert.ok(cheap.feasible);
  // 통합 최적해는 항상 "시비 없이 광량만" 해보다 나쁘지 않다(그 해가 후보에 포함돼 있다)
  assert.ok(cheap.chosen.profitPerDay >= cheap.lightOnly.profitPerDay);
  assert.ok(cheap.chosen.co2Ppm > CO2_AMBIENT_PPM, "탄산이 싼데도 시비를 안 골랐다");

  const pricey = co2LightCoOptimize({ cropKey: "leafy", ledPowerKw: LED_KW, co2CostPerKg: 100000 });
  assert.equal(pricey.chosen.co2Ppm, CO2_AMBIENT_PPM, "탄산이 비싼데 시비를 골랐다");
  assert.ok(pricey.chosen.profitPerDay >= pricey.lightOnly.profitPerDay);
});

// ── 학습 계층 ──────────────────────────────────────────────────────────────

function syntheticReadings(n: number, breakAt?: number): IoTReading[] {
  return Array.from({ length: n }, (_, i) => {
    const dayPhase = ((i % 24) / 24) * 2 * Math.PI;
    // 일주기 성분은 24시간 차분으로 지워지므로, 차분 뒤에도 산포가 남도록
    // 비주기 성분을 섞는다(실측 데이터의 잡음에 해당).
    const jitter = (k: number) => Math.sin(i / k) * 0.4 + Math.cos(i / (k + 3)) * 0.3;
    const temp = 21 + Math.sin(dayPhase) * 2 + jitter(7);
    // 정상 구간에서는 습도가 온도와 반대로 움직인다. breakAt 이후 그 관계가 끊긴다.
    const humidity =
      breakAt != null && i >= breakAt
        ? 65 + Math.sin(dayPhase) * 3 + jitter(5) + (i - breakAt) * 0.15
        : 65 - Math.sin(dayPhase) * 3 + jitter(5);
    return {
      temperature: temp,
      humidity,
      co2Level: 900 + Math.sin(dayPhase + 1) * 40 + jitter(9) * 10,
      lightIntensity: i % 24 < 16 ? 12000 : 0,
      phLevel: 6 + Math.sin(i / 11) * 0.2,
    };
  });
}

test("다변량 관리도: 센서 간 관계가 끊기면 잡는다", () => {
  const clean = multivariateDrift(syntheticReadings(200), { lag: 24 });
  assert.equal(clean.status, "ok");
  const broken = multivariateDrift(syntheticReadings(200, 120), { lag: 24 });
  assert.equal(broken.status, "ok");
  assert.equal(broken.detected, true, "관계 붕괴를 놓쳤다");
  assert.ok(broken.topContributor != null);
});

test("다변량 관리도: 산포 없는 축은 빼고 나머지로 본다", () => {
  const flat = syntheticReadings(200).map((r) => ({ ...r, phLevel: 6 }));
  const res = multivariateDrift(flat, { lag: 24 });
  assert.equal(res.status, "ok");
  assert.deepEqual(res.droppedSensors, ["phLevel"]);
  assert.ok(!res.sensors.includes("phLevel"));
  // 축을 뺀 만큼 자유도가 줄어 임계값도 낮아져야 한다
  assert.ok(res.threshold < 18.5);
});

test("다변량 관리도: 쓸 수 있는 축이 2개 미만이면 판정 보류한다", () => {
  const flat = syntheticReadings(200).map((r) => ({
    ...r,
    humidity: 65,
    co2Level: 900,
    phLevel: 6,
  }));
  const res = multivariateDrift(flat, { lag: 24 });
  assert.equal(res.status, "degenerate-covariance");
  assert.equal(res.detected, false);
  assert.equal(res.droppedSensors.length, 3);
});

test("컨포멀 구간: 표본이 부족하면 구간을 만들지 않는다", () => {
  const few = conformalHalfWidth([1, -2, 3], 0.9);
  assert.equal(few.valid, false);
  assert.equal(few.halfWidth, 0);

  const enough = conformalHalfWidth(
    Array.from({ length: 60 }, (_, i) => Math.sin(i) * 10),
    0.9
  );
  assert.equal(enough.valid, true);
  assert.ok(enough.halfWidth > 0);
  assert.ok(enough.achievedCoverage >= 0.9);
});

test("컨포멀 구간: 지평이 멀수록 폭이 넓어지고 하한은 음수가 아니다", () => {
  const residuals = Array.from({ length: 60 }, (_, i) => Math.cos(i) * 8);
  const f = withConformalInterval([20, 20, 20, 20], residuals, 0.9);
  assert.ok(f.upper[3] - f.lower[3] >= f.upper[0] - f.lower[0]);
  assert.ok(f.lower.every((v) => v >= 0));
  assert.ok(f.upper.every((v, i) => v >= f.point[i]));
});

test("LinUCB: 관측을 반영하면 좋은 팔의 점수가 올라간다", () => {
  let s = initLinUcb(2, 2);
  const ctx = [1, 0];
  const before = linUcbSelect(s, ctx).scores;
  s = linUcbUpdate(s, 0, ctx, 1000);
  const after = linUcbSelect(s, ctx).scores;
  assert.ok(after[0] > before[0], "보상을 받은 팔의 점수가 오르지 않았다");
});

test("문맥 밴딧: 사이트 특성이 다르면 다른 답을 낸다", () => {
  const sites = Array.from({ length: 24 }, (_, i) => ({
    siteId: `s${i}`,
    features: [(i % 4) / 3, ((i + 1) % 3) / 2, ((i + 2) % 5) / 4],
  }));
  const r = contextualCropAllocation({
    sites,
    arms: [
      { name: "A", base: 7000, weights: [200, 500, 1500] },
      { name: "B", base: 9000, weights: [800, 4000, 500] },
      { name: "C", base: 8000, weights: [6000, 3000, 1000] },
    ],
    noiseStd: 0,
  });
  assert.ok(r.distinctRecommendations > 1, "모든 사이트에 같은 답을 냈다");
  assert.equal(r.assignments.length, sites.length);
  assert.equal(r.synthetic, true);
  const shareSum = r.armShares.reduce((s, a) => s + a.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 0.05);
});
