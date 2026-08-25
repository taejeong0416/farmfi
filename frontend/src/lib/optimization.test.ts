// 운영 최적화 회귀 테스트 — 실행: npm test
//
// 여기서 지키는 것은 "숫자가 얼마인가"가 아니라 **불변식**이다. 파라미터(요금표·수율
// 계수·정격)는 실측이 들어오면 바뀌지만, 아래 성질이 깨지면 리포트가 틀린 조언을
// 하거나 판정 불가를 판정 결과로 둔갑시킨다.
//   ① 농학 하드제약(명기·암기)은 어떤 경로로도 우회되지 않는다
//   ② 광량 증설은 전력 증가를 동반한다 — 시간 압축은 공짜가 아니다
//   ③ 산포가 없는 계열은 "정상"이 아니라 "판정 불가"로 나온다
//   ④ 절감·상승분 비교는 같은 기준끼리 이뤄진다

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveLighting,
  dliSchedule,
  cusumDrift,
  weatherCompensatedCusum,
  nutrientAdvice,
  operationsSavingsReport,
  thompsonAllocation,
  peakStagger,
  TARIFF_FLAT_GENERAL,
} from "./optimization";
import { profitOptimization, photoperiodSafeDli } from "./optimization-advanced";
import { unifiedCoOptimize } from "./optimization-unified";
import { getCrop } from "./crop-profiles";
import { PARAMS } from "./optimization-params";
import type { IoTReading } from "./iot-health";

const LEAFY = getCrop("leafy");
const LED_KW = 4;

// ── ① 농학 하드제약 ────────────────────────────────────────────────────────

test("resolveLighting: 명기는 최대광주기를, 암기는 최소치를 지킨다", () => {
  for (const key of ["leafy", "basil", "cherryTomato", "microgreen"]) {
    const crop = getCrop(key);
    const light = resolveLighting({
      cropKey: key,
      dliTarget: crop.dliTarget,
      ledPowerKw: LED_KW,
    });
    assert.ok(
      light.hours <= crop.maxPhotoperiodH,
      `${key}: 명기 ${light.hours}h > 상한 ${crop.maxPhotoperiodH}h`
    );
    assert.ok(
      light.darkH >= crop.minDarkH,
      `${key}: 암기 ${light.darkH}h < 최소 ${crop.minDarkH}h`
    );
    assert.equal(light.photoperiodSafe, true, `${key}: 안전 판정 실패`);
    assert.ok(
      light.achievedDli >= crop.dliTarget,
      `${key}: 달성 DLI ${light.achievedDli} < 목표 ${crop.dliTarget}`
    );
  }
});

test("dliSchedule: 점등은 연속 블록이고 관행보다 비싸지 않다", () => {
  const plan = dliSchedule({ cropKey: "leafy", ledPowerKw: LED_KW, tariff: TARIFF_FLAT_GENERAL });
  assert.equal(plan.litHours.length, plan.requiredHours);
  // 연속 블록: 인접 시간이 원형 24h에서 1씩 증가
  for (let i = 1; i < plan.litHours.length; i++) {
    assert.equal(
      plan.litHours[i],
      (plan.litHours[i - 1] + 1) % 24,
      `연속 블록이 아님: ${plan.litHours.join(",")}`
    );
  }
  assert.equal(plan.photoperiodSafe, true);
  assert.ok(plan.costPerDay <= plan.naiveCostPerDay);
  assert.ok(plan.savingPerMonth >= 0);
});

test("profitOptimization: 이익최대 DLI가 광주기 안전을 되살리지 않는다", () => {
  // 채소값을 크게 올려 "광량을 최대로 밀어라"는 압력을 준다.
  const plan = profitOptimization({
    cropKey: "leafy",
    ledPowerKw: LED_KW,
    cropPricePerKg: 20000,
  });
  assert.ok(
    plan.profitMaxDli <= plan.maxFeasibleDli,
    `이익최대 DLI ${plan.profitMaxDli} > 물리 상한 ${plan.maxFeasibleDli}`
  );
  const light = resolveLighting({
    cropKey: "leafy",
    dliTarget: plan.profitMaxDli,
    ledPowerKw: LED_KW,
  });
  assert.equal(light.photoperiodSafe, true, "이익최대 DLI가 광주기 제약 위반");
  assert.equal(light.feasible, true, "이익최대 DLI가 정격 PPFD 초과");
});

test("unifiedCoOptimize: 선택된 해가 광주기 안전을 만족한다", () => {
  const ext24 = Array(24).fill(18);
  const r = unifiedCoOptimize({ cropKey: "leafy", ledPowerKw: LED_KW, hourlyExtTemp: ext24 });
  assert.equal(r.photoperiodSafe, true);
  assert.ok(r.litHours.length <= LEAFY.maxPhotoperiodH);
  assert.ok(r.darkContinuousH >= LEAFY.minDarkH);
  assert.ok(r.ppfd <= LEAFY.maxPpfd, `PPFD ${r.ppfd}가 정격 ${LEAFY.maxPpfd} 초과`);
  // 순차 파이프라인은 통합 탐색의 부분집합이므로 개선분은 음수가 될 수 없다.
  assert.ok(r.vsSequentialNetValue >= 0);
});

// ── ② 시간 압축은 공짜가 아니다 ────────────────────────────────────────────

test("resolveLighting: PPFD를 올려 시간을 압축하면 소비전력도 오른다", () => {
  const base = resolveLighting({ cropKey: "leafy", dliTarget: 12, ledPowerKw: LED_KW });
  const high = resolveLighting({ cropKey: "leafy", dliTarget: 20, ledPowerKw: LED_KW });
  // 둘 다 명기가 상한에 걸려 시간은 같지만, 광량이 큰 쪽은 전력이 더 커야 한다.
  assert.ok(high.ppfd > base.ppfd);
  assert.ok(
    high.ledPowerKw > base.ledPowerKw,
    `DLI를 올렸는데 소비전력이 그대로: ${base.ledPowerKw} → ${high.ledPowerKw}`
  );
  // 전력량(kWh)은 광량에 비례해야 한다 — 시간 압축으로 전력량이 줄면 물리가 깨진다.
  const kwhRatio = (high.ledPowerKw * high.hours) / (base.ledPowerKw * base.hours);
  const dliRatio = high.achievedDli / base.achievedDli;
  assert.ok(
    Math.abs(kwhRatio - dliRatio) < 0.1,
    `전력량비 ${kwhRatio.toFixed(3)} ≠ 광량비 ${dliRatio.toFixed(3)}`
  );
});

test("unifiedCoOptimize: DLI가 탐색 상한에 무조건 붙지 않는다", () => {
  // 전기가 공짜면 최적해는 상한에 붙는 게 맞다. 값이 실제로 반응하는지 본다.
  const ext24 = Array(24).fill(18);
  const cheap = unifiedCoOptimize({
    cropKey: "leafy",
    ledPowerKw: LED_KW,
    hourlyExtTemp: ext24,
    cropPricePerKg: 20000,
  });
  const pricey = unifiedCoOptimize({
    cropKey: "leafy",
    ledPowerKw: LED_KW,
    hourlyExtTemp: ext24,
    cropPricePerKg: 1000,
  });
  assert.ok(
    pricey.dliChosen < cheap.dliChosen,
    `채소값이 20배 다른데 DLI가 같음: ${pricey.dliChosen} vs ${cheap.dliChosen}`
  );
});

test("photoperiodSafeDli는 dliSchedule과 같은 운전점을 쓴다", () => {
  const a = dliSchedule({ cropKey: "leafy", ledPowerKw: LED_KW });
  const b = photoperiodSafeDli({ cropKey: "leafy", ledPowerKw: LED_KW });
  assert.equal(b.requiredHours, a.requiredHours);
  assert.equal(b.ppfdUsed, a.ppfdUsed);
  assert.equal(b.ledPowerKwUsed, a.ledPowerKwUsed);
  assert.equal(b.costPerDay, a.costPerDay);
});

// ── ③ 판정 불가를 판정 결과로 둔갑시키지 않는다 ────────────────────────────

function constantReadings(n: number, phStep: number): IoTReading[] {
  // pH만 굵게 양자화된 계열(실측 딸기 온실 토양 프로브가 이 모양이다).
  return Array.from({ length: n }, (_, i) => ({
    temperature: 20 + Math.sin(i / 4),
    humidity: 65 + Math.cos(i / 5),
    co2Level: 800 + Math.sin(i / 3) * 20,
    lightIntensity: i % 24 < 16 ? 12000 : 0,
    phLevel: Math.round((i % 3) * phStep * 100) / 100,
  }));
}

test("cusumDrift: 24h 차분에 산포가 없으면 판정 보류한다", () => {
  // 주기 24로 반복되는 pH → 24h 차분이 항상 0 → σ 추정 불가.
  const readings = constantReadings(120, 0);
  const ph = cusumDrift(readings, { lag: 24 }).find((c) => c.sensor === "phLevel")!;
  assert.equal(ph.status, "degenerate-scale");
  assert.equal(ph.detected, false);
  assert.equal(ph.maxStatistic, 0, "산포 0인데 통계량이 발산했다");
});

test("cusumDrift: 데이터가 짧으면 판정 보류한다", () => {
  const r = cusumDrift(constantReadings(10, 0.17), { lag: 24 });
  assert.ok(r.every((c) => c.status === "insufficient-data" && !c.detected));
});

test("weatherCompensatedCusum: 내부값에서 파생한 외기는 판정하지 않는다", () => {
  const internal = Array.from({ length: 100 }, (_, i) => 20 + Math.sin(i / 6) * 5);
  const derived = internal.map((t) => t - 0.73); // 내부에서 상수를 뺀 가짜 외기
  const r = weatherCompensatedCusum(internal, derived);
  assert.equal(r.status, "degenerate-scale");
  assert.equal(r.detected, false);
  assert.ok(!r.note.includes("정상"), "판정 불가를 '정상'이라 말하면 안 된다");
});

test("weatherCompensatedCusum: 독립 실측 외기면 드리프트를 잡는다", () => {
  const internal: number[] = [];
  const external: number[] = [];
  for (let i = 0; i < 120; i++) {
    const ext = 10 + Math.sin(i / 8) * 6;
    external.push(ext);
    // 60번째 표본부터 단열 성능 저하로 내외기 차가 서서히 줄어든다.
    const degradation = i < 60 ? 0 : (i - 60) * 0.08;
    internal.push(ext + 10 - degradation + Math.sin(i / 3) * 0.3);
  }
  const r = weatherCompensatedCusum(internal, external);
  assert.equal(r.status, "ok");
  assert.equal(r.detected, true, "명백한 차분 이동을 놓쳤다");
});

test("nutrientAdvice: 양액 범위 밖 센서값은 보정 권고 대신 보류한다", () => {
  const base: IoTReading = {
    temperature: 20,
    humidity: 65,
    co2Level: 900,
    lightIntensity: 12000,
    phLevel: 6,
  };
  assert.equal(nutrientAdvice({ ...base, phLevel: 2 }, "leafy").status, "unavailable");
  assert.equal(nutrientAdvice({ ...base, phLevel: 6 }, "leafy").status, "ok");
  assert.equal(nutrientAdvice({ ...base, phLevel: 5 }, "leafy").status, "adjust");
});

// ── ④ 비교는 같은 기준끼리 ─────────────────────────────────────────────────

test("operationsSavingsReport: 폐기 절감은 판매가가 아니라 변동비로 센다", () => {
  const r = operationsSavingsReport({
    dliSavingPerMonth: 45600,
    peakSavingPerMonth: 5824,
    saImprovementPerMonth: 21240,
    wasteReductionUnits: 100,
    dliCo2PerMonth: 35.8,
  });
  const waste = r.breakdown.find((b) => b.lever.includes("폐기"))!;
  const unitCost = PARAMS.unitVariableCost.value;
  // 판매가(직판 2,000원)가 아니라 변동비로 센다 — 안 심어서 아끼는 건 매출이 아니다.
  assert.ok(unitCost < PARAMS.unitSalePrice.value);
  assert.equal(waste.wonPerMonth, 100 * unitCost);
  // SA 개선분은 전력량요금과 겹치므로 합계에 들어가면 안 된다.
  assert.equal(r.monthlyWonSaved, 45600 + 5824 + 100 * unitCost);
  assert.equal(r.annualWonSaved, r.monthlyWonSaved * 12);
});

test("thompsonAllocation: 상승분은 양쪽 기대값으로 계산한다", () => {
  const arms = [
    { name: "A", trueMeanMargin: 6500, trueStd: 1500 },
    { name: "B", trueMeanMargin: 7200, trueStd: 1800 },
    { name: "C", trueMeanMargin: 8800, trueStd: 3000 },
  ];
  const r = thompsonAllocation({ arms, rounds: 200, seed: 11 });
  const expected = r.allocation.reduce(
    (s, a, i) => s + a.trays * arms[i].trueMeanMargin,
    0
  );
  assert.equal(r.banditTotalMargin, Math.round(expected));
  assert.equal(r.uniformTotalMargin, Math.round((6500 + 7200 + 8800) / 3) * 200);
  assert.equal(r.uplift, r.banditTotalMargin - r.uniformTotalMargin);
  assert.ok(r.uplift > 0, "밴딧이 균등 배분보다 못한 배분을 냈다");
  assert.equal(r.synthetic, true);
});

test("peakStagger: 피크는 관행보다 커지지 않고 필요 가동시간은 보존된다", () => {
  const plan = peakStagger([
    { name: "LED", kw: 4, hoursNeeded: 16, fixedHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    { name: "공조", kw: 1.5, hoursNeeded: 10 },
    { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
  ]);
  assert.ok(plan.optimizedPeakKw <= plan.naivePeakKw);
  assert.ok(plan.demandChargeSavingIfMeteredPerMonth >= 0);
  assert.equal(plan.assignments.find((a) => a.name === "공조")!.hours.length, 10);
  assert.equal(plan.assignments.find((a) => a.name === "양액펌프")!.hours.length, 6);
});
