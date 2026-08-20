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
  trueYield,
  type SynthSpec,
  type SynthFeature,
} from "./growth-recipe-synth";
import { analyzeGrowthRecipe, recipeGapAnalysis, FEATURES } from "./growth-recipe";
import type { GrowthObservation } from "./growth-recipe";

// 오목성 검사를 건너뛰고 관측을 만든다 — 안장 반응면을 파이프라인에 먹여
// 진단이 켜지는지 보려면 검사를 우회해야 한다.
function rawObservations(spec: SynthSpec, n: number, seed = 3): GrowthObservation[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: n }, () => {
    const env = {} as Record<SynthFeature, number>;
    for (const f of SYNTH_FEATURES) {
      const [lo, hi] = spec.bounds[f];
      env[f] = lo + rand() * (hi - lo);
    }
    return { ...env, cropKey: "leafy", yield: trueYield(spec, env) };
  });
}

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

test("안장 반응면을 최대점이라 말하지 않는다", () => {
  const saddle: SynthSpec = { ...LEAFY_SPEC, cross: [["temp", "co2", 0.01]] };
  const { surface, note } = analyzeGrowthRecipe(rawObservations(saddle, 200), {
    cropKey: "leafy",
  });
  assert.equal(surface, "안장점");
  assert.match(note, /안장/);

  // 그리고 갭 분석이 그 위에서 조작 권고를 내지 않는다
  const fit = analyzeGrowthRecipe(rawObservations(saddle, 200), { cropKey: "leafy" });
  const gap = recipeGapAnalysis(fit, {});
  assert.match(gap.headline, /권고를 내지 않는다/);
});

test("표본이 파라미터에 못 미치면 R²는 0이 아니라 판정불가다", () => {
  const { observations } = generateObservations(LEAFY_SPEC, 20);
  const { modelR2, note } = analyzeGrowthRecipe(observations, { cropKey: "leafy" });
  assert.equal(modelR2, null);
  assert.match(note, /판정 불가/);
});

test("최적점이 관측 밖이면 경계해로 표시한다", () => {
  // 온도를 16~20℃에서만 관측했는데 진짜 최적은 22℃다. 파이프라인은 20℃를
  // 답으로 낼 수밖에 없고, 그건 "여기가 최적"이 아니라 "여기까지 봤다"는 뜻이다.
  const narrow: SynthSpec = {
    ...LEAFY_SPEC,
    bounds: { ...LEAFY_SPEC.bounds, temp: [16, 20] },
  };
  const { observations } = generateObservations(narrow, 200);
  const { recipe } = analyzeGrowthRecipe(observations, { cropKey: "leafy" });
  const temp = recipe.find((r) => r.feature === "temp")!;
  assert.equal(temp.atBoundary, true, `온도 최적 ${temp.optimum} — 경계해로 잡히지 않았다`);
  assert.ok(temp.optimum <= 20.01, "관측하지 않은 구간으로 외삽했다");
  // 관측이 최적점을 담은 요인은 경계해가 아니다
  assert.equal(recipe.find((r) => r.feature === "ph")!.atBoundary, false);
});

test("요인별 상방의 합이 전체 상방과 맞는다", () => {
  const { observations } = generateObservations(LEAFY_SPEC, 200);
  const fit = analyzeGrowthRecipe(observations, { cropKey: "leafy" });
  // 현재 조건을 최적에서 일부러 떨어뜨려 상방이 생기게 한다
  const gap = recipeGapAnalysis(fit, { temp: 19, co2: 650, ec: 2.1, dli: 12 });
  const sum = gap.actions.reduce((s, a) => s + a.predictedYieldUpliftPct, 0);
  // 항목마다 0.1%로 반올림하므로 요인 6개면 최대 0.3% 어긋난다
  assert.ok(
    Math.abs(sum - gap.totalPotentialUpliftPct) < 0.35,
    `부분합 ${sum.toFixed(1)}% vs 전체 ${gap.totalPotentialUpliftPct}%`
  );
  assert.ok(gap.totalPotentialUpliftPct > 0, "떨어진 조건인데 상방이 없다");
  assert.equal(gap.actions.length, FEATURES.length);
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
