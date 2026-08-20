// 수익 최적 레시피 테스트 — 실행: npm test
//
// 주장은 하나다. "레시피 층과 스케줄 층이 같은 목적함수를 본다."
// 그 말이 성립하려면 단가가 설정점을 실제로 움직여야 하고, 단가가 0이면
// 수율 최적점으로 되돌아와야 한다. 둘 다 안 되면 비용은 장식일 뿐이다.

import test from "node:test";
import assert from "node:assert/strict";

import { LEAFY_SPEC, generateObservations } from "./growth-recipe-synth";
import { analyzeGrowthRecipe } from "./growth-recipe";
import { profitOptimalRecipe } from "./growth-recipe-profit";

const obs = generateObservations(LEAFY_SPEC, 200, 7, "leafy").observations;
const fit = analyzeGrowthRecipe(obs, { cropKey: "leafy" });
const run = (o: Parameters<typeof profitOptimalRecipe>[2] = {}) =>
  profitOptimalRecipe(obs, fit, { cropKey: "leafy", ledPowerKw: 4, externalTempC: 20, ...o });

const at = (r: ReturnType<typeof run>, f: string) => r.setpoints.find((s) => s.feature === f)!;

test("전력에 값이 붙으면 목표 DLI가 수율 최적점보다 내려온다", () => {
  const r = run();
  const dli = at(r, "dli");
  assert.ok(
    dli.profitOptimum < dli.yieldOptimum,
    `DLI가 안 내려왔다 (수율 ${dli.yieldOptimum} → 수익 ${dli.profitOptimum})`
  );
  assert.ok(r.atProfitOptimum.cost.light < r.atYieldOptimum.cost.light, "광 비용이 안 줄었다");
});

test("전력·탄산이 공짜면 수율 최적점으로 돌아온다", () => {
  const free = run({ avgTariff: 0, co2CostPerKg: 0 });
  const dli = at(free, "dli");
  const co2 = at(free, "co2");
  // 격자 해상도(구간의 1/40)만큼의 오차는 허용한다
  assert.ok(Math.abs(dli.shift) < 0.5, `공짜인데 DLI가 ${dli.shift} 움직였다`);
  assert.ok(Math.abs(co2.shift) < 25, `공짜인데 CO₂가 ${co2.shift} 움직였다`);
});

test("전기가 비쌀수록 목표 DLI가 더 내려간다", () => {
  const cheap = at(run({ avgTariff: 50 }), "dli").profitOptimum;
  const mid = at(run({ avgTariff: 150 }), "dli").profitOptimum;
  const dear = at(run({ avgTariff: 400 }), "dli").profitOptimum;
  assert.ok(cheap >= mid && mid >= dear, `단조가 아니다: ${cheap} / ${mid} / ${dear}`);
  assert.ok(cheap > dear, `단가 8배 차이인데 목표가 같다 (${cheap} vs ${dear})`);
});

test("작물값이 비싸지면 수율 쪽으로 다시 올라간다", () => {
  const lowPrice = at(run({ cropPricePerKg: 1500 }), "dli").profitOptimum;
  const highPrice = at(run({ cropPricePerKg: 20000 }), "dli").profitOptimum;
  assert.ok(highPrice > lowPrice, `단가가 13배인데 목표가 안 올랐다 (${lowPrice} vs ${highPrice})`);
});

test("수익 최적점이 수율 최적점보다 수익이 크다", () => {
  const r = run();
  assert.ok(r.atProfitOptimum.profitPerDay >= r.atYieldOptimum.profitPerDay);
  assert.equal(
    r.foregoneProfitPerDay,
    r.atProfitOptimum.profitPerDay - r.atYieldOptimum.profitPerDay
  );
  // 수율은 오히려 줄어드는 게 정상이다 — 그게 이 층의 존재 이유다
  assert.ok(r.atProfitOptimum.yieldKgM2 <= r.atYieldOptimum.yieldKgM2);
});

test("비용이 붙는 요인이 무엇인지 밝힌다", () => {
  const r = run();
  const costed = r.setpoints.filter((s) => s.costed).map((s) => s.feature).sort();
  assert.deepEqual(costed, ["co2", "dli", "temp"]);
  // 나머지 셋은 이 모델에 비용이 없다 — 움직인다면 상호작용 때문이다
  for (const f of ["humidity", "ph"]) assert.equal(at(r, f).costed, false);
});

test("광주기·정격을 깨는 점을 답으로 내지 않는다", () => {
  const r = run({ avgTariff: 0 });
  assert.equal(r.atProfitOptimum.feasible, true);
});
