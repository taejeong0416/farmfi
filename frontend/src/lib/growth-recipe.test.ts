// 생육레시피 회귀 테스트 — 실행: npm test
//
// 이 계층의 주장은 "환경↔수율 데이터에서 최적 생육조건을 찾아낸다"이다. 실 수확
// 라벨이 없는 동안 그 주장을 확인할 방법은 최적점을 아는 합성 반응면을 주고
// 되찾는지 보는 것뿐이다. 되찾지 못하면 화면의 숫자는 근거가 없다.
//
//   · 테스트 베드가 진짜 최대점을 갖는다 (안장점이면 회수 자체가 정의되지 않는다)
//   · 파이프라인이 그 최적점을 쓸 만한 오차 안에서 되찾는다
//   · 농학 클램프가 최적점을 대신 찍어주고 있지 않다

import test from "node:test";
import assert from "node:assert/strict";

import {
  LEAFY_SPEC,
  SYNTH_FEATURES,
  concavityCheck,
  assertConcave,
  generateObservations,
  trueOptimum,
  type SynthSpec,
} from "./growth-recipe-synth";
import { analyzeGrowthRecipe } from "./growth-recipe";

test("테스트 베드가 오목하다 — 최대점이 존재한다", () => {
  const c = concavityCheck(LEAFY_SPEC);
  assert.equal(c.concave, true, `오목성 실패: ${c.failedAt}`);
  // 상호작용이 상한에 붙어 있으면 잡음 한 번에 안장으로 넘어간다. 여유를 둔다.
  for (const u of c.crossUsage) {
    assert.ok(u.ratio < 0.6, `${u.pair} 상호작용이 오목성 상한의 ${u.ratio}배 — 여유가 없다`);
  }
});

test("상호작용이 상한을 넘으면 안장점이 되고, 검사가 잡는다", () => {
  // 상호작용 계수 0.01은 temp·co2 오목성 상한 9.8e-4의 10배다. 이 스펙의 최적점은
  // center가 아니라 표본 상자의 모서리이므로, 회수 테스트의 기준이 성립하지 않는다.
  const saddle: SynthSpec = {
    ...LEAFY_SPEC,
    cross: [["temp", "co2", 0.01]],
  };
  const c = concavityCheck(saddle);
  assert.equal(c.concave, false);
  assert.ok(c.crossUsage[0].ratio > 1);
  assert.throws(() => assertConcave(saddle), /오목하지 않다/);
});

test("응답이 하한에 절단되지 않는다 — 회귀 편향 없음", () => {
  const { floorRate } = generateObservations(LEAFY_SPEC, 200);
  assert.ok(floorRate < 0.02, `하한 절단 ${Math.round(floorRate * 100)}% — 응답이 잘려 회귀가 편향된다`);
});

test("파이프라인이 알려진 최적점을 되찾는다", () => {
  const { observations } = generateObservations(LEAFY_SPEC, 200);
  const truth = trueOptimum(LEAFY_SPEC);
  const { recipe, modelR2 } = analyzeGrowthRecipe(observations, { cropKey: "leafy" });

  assert.ok(modelR2 !== null && modelR2 > 0.8, `설명력이 낮다 (R²=${modelR2})`);

  for (const f of SYNTH_FEATURES) {
    const got = recipe.find((r) => r.feature === f);
    assert.ok(got, `${f} 설정점 없음`);
    const [lo, hi] = LEAFY_SPEC.bounds[f];
    const errRatio = Math.abs(got.optimum - truth[f]) / (hi - lo);
    assert.ok(
      errRatio < 0.1,
      `${f}: 최적점 ${got.optimum} vs 정답 ${truth[f]} — 탐색범위의 ${Math.round(errRatio * 100)}% 빗나감`
    );
  }
});

test("농학 클램프가 최적점을 대신 찍어주지 않는다", () => {
  // 클램프를 끄고도(cropKey 미지정) 같은 답이 나와야 데이터가 찾은 것이다.
  const { observations } = generateObservations(LEAFY_SPEC, 200);
  const truth = trueOptimum(LEAFY_SPEC);
  const { recipe } = analyzeGrowthRecipe(observations);

  for (const f of SYNTH_FEATURES) {
    const got = recipe.find((r) => r.feature === f)!;
    const [lo, hi] = LEAFY_SPEC.bounds[f];
    const errRatio = Math.abs(got.optimum - truth[f]) / (hi - lo);
    assert.ok(
      errRatio < 0.15,
      `${f}: 클램프 없이는 ${got.optimum} (정답 ${truth[f]}) — 농학범위가 답을 대신 내고 있었다`
    );
  }
});
