// 생육레시피 고도화 계층 테스트 — 실행: npm test
//
// 이 계층의 주장은 셋이다.
//   · 불확실성을 데이터에서 잰다 (표본 수만 보는 공식이 아니다)
//   · 품종이 바뀌어도 배운 것이 강도만큼 넘어간다 (리셋도 승계도 아니다)
//   · 아직 모르는 요인을 실험으로 지목한다 (표본 수 임계값이 아니다)
// 셋 다 "그럴듯한 문장"으로 통과할 수 있는 주장이라, 반대 방향 데이터를 넣어
// 값이 실제로 움직이는지 본다.

import test from "node:test";
import assert from "node:assert/strict";

import {
  agronomyInformedRecipe,
  activeLearningSuggest,
  shapImportance,
} from "./growth-recipe-advanced";
import { LEAFY_SPEC, generateObservations, type SynthSpec } from "./growth-recipe-synth";
import { getCrop } from "./crop-profiles";
import { transferWeight } from "./crop-normalize";

const sp = (setpoints: ReturnType<typeof agronomyInformedRecipe>["setpoints"], f: string) =>
  setpoints.find((s) => s.feature === f)!;

test("불확실성이 표본 수가 아니라 잡음에 반응한다", () => {
  // 표본 수가 같고 잡음만 5배인 두 데이터셋. 표본 수의 함수로 SE를 만들면 둘이
  // 같은 값을 받는다 — 그게 이 계층이 원래 갖고 있던 결함이다.
  const quiet = generateObservations(LEAFY_SPEC, 120, 5).observations;
  const noisy = generateObservations({ ...LEAFY_SPEC, noiseSd: 0.6 }, 120, 5).observations;

  const q = agronomyInformedRecipe(quiet, "leafy").setpoints;
  const n = agronomyInformedRecipe(noisy, "leafy").setpoints;

  assert.equal(quiet.length, noisy.length);
  assert.ok(
    sp(n, "temp").sigPostZ > sp(q, "temp").sigPostZ * 1.5,
    `잡음 5배인데 불확실성이 안 커졌다 (조용 ${sp(q, "temp").sigPostZ} vs 시끄러움 ${sp(n, "temp").sigPostZ})`
  );
  // 구간도 따라 넓어져야 한다
  const width = (s: ReturnType<typeof sp>) => s.interval[1] - s.interval[0];
  assert.ok(width(sp(n, "temp")) > width(sp(q, "temp")));
});

test("데이터가 쌓일수록 문헌에서 자체 데이터로 넘어간다", () => {
  const own = (n: number) =>
    sp(agronomyInformedRecipe(generateObservations(LEAFY_SPEC, n, 9).observations, "leafy").setpoints, "ec")
      .source.own;

  const few = own(30);
  const many = own(200);
  assert.ok(few < many, `표본이 늘었는데 자체 데이터 비중이 안 늘었다 (${few}% → ${many}%)`);
  assert.ok(few + sp(agronomyInformedRecipe(generateObservations(LEAFY_SPEC, 30, 9).observations, "leafy").setpoints, "ec").source.literature >= 99);
});

test("표본이 적합에 못 미치면 문헌만 쓴다", () => {
  const { observations } = generateObservations(LEAFY_SPEC, 10);
  const s = agronomyInformedRecipe(observations, "leafy").setpoints;
  const crop = getCrop("leafy");
  assert.equal(sp(s, "temp").source.own, 0);
  assert.equal(sp(s, "temp").source.literature, 100);
  assert.equal(sp(s, "temp").dataOptimum, null);
  // 문헌만 쓸 때의 권장값은 정상범위 중앙이다
  const mid = (crop.healthyRanges.temperature[0] + crop.healthyRanges.temperature[1]) / 2;
  assert.equal(sp(s, "temp").hybridOptimum, mid);
});

test("상추에서 배운 편차가 바질로 강도만큼 넘어간다", () => {
  // 진짜 최적 온도가 문헌 중앙(21℃)보다 1.5℃ 낮은 사이트. 상추로만 관측했다.
  const coolSite: SynthSpec = {
    ...LEAFY_SPEC,
    center: { ...LEAFY_SPEC.center, temp: 19.5 },
  };
  const lettuceOnly = generateObservations(coolSite, 150, 4, "leafy").observations;

  const basilMid = (getCrop("basil").healthyRanges.temperature[0] + getCrop("basil").healthyRanges.temperature[1]) / 2;
  const basil = sp(agronomyInformedRecipe(lettuceOnly, "basil").setpoints, "temp");
  const tomato = sp(agronomyInformedRecipe(lettuceOnly, "cherryTomato").setpoints, "temp");

  // 바질 데이터가 한 줄도 없는데 권장값이 문헌 중앙에서 내려와 있어야 한다
  assert.ok(basil.hybridOptimum < basilMid, `바질 권장 ${basil.hybridOptimum} — 이전이 일어나지 않았다`);
  assert.ok(basil.source.transfer > 0, "이전 비중이 0이다");
  assert.equal(basil.source.own, 0, "바질 자체 데이터가 없는데 자체 비중이 잡혔다");

  // 먼 품종일수록 덜 끌려간다
  const tomatoMid = (getCrop("cherryTomato").healthyRanges.temperature[0] + getCrop("cherryTomato").healthyRanges.temperature[1]) / 2;
  assert.ok(
    basilMid - basil.hybridOptimum > tomatoMid - tomato.hybridOptimum,
    "과채류가 허브보다 더 끌려갔다"
  );
  assert.ok(basil.source.transfer > tomato.source.transfer);
});

test("이전 비중이 이전계수를 넘지 못한다", () => {
  // 원 품종 데이터를 아무리 늘려도 이전이 밀 수 있는 몫에는 상한이 있어야 한다.
  // 상한이 없으면 상추 데이터 1000개가 토마토 레시피를 상추 최적점으로 끌고 간다.
  const coolSite: SynthSpec = { ...LEAFY_SPEC, center: { ...LEAFY_SPEC.center, temp: 19.5 } };
  const share = (n: number) =>
    sp(
      agronomyInformedRecipe(generateObservations(coolSite, n, 4, "leafy").observations, "cherryTomato")
        .setpoints,
      "temp"
    ).source.transfer;

  const w = transferWeight("leafy", "cherryTomato", "temp");
  const cap = Math.round(w * 100);
  // 표본을 5배로 늘려도 상한 언저리에서 멈춘다
  assert.ok(share(150) <= cap + 2, `표본 150에서 이미 상한 ${cap}%를 넘었다 (${share(150)}%)`);
  assert.ok(share(800) <= cap + 2, `표본 800에서 상한 ${cap}%를 넘었다 (${share(800)}%)`);
});

test("같은 품종 데이터가 있으면 이전보다 자체가 앞선다", () => {
  const lettuce = generateObservations(LEAFY_SPEC, 150, 4, "leafy").observations;
  const basil = generateObservations(LEAFY_SPEC, 150, 8, "basil").observations;
  const s = sp(agronomyInformedRecipe([...lettuce, ...basil], "basil").setpoints, "temp");
  assert.ok(s.source.own > s.source.transfer, `자체 ${s.source.own}% vs 이전 ${s.source.transfer}%`);
});

test("실험 제안이 표본 수가 아니라 남은 불확실성에 걸린다", () => {
  // 잘 관측된 데이터: 제안 없음
  const clean = generateObservations(LEAFY_SPEC, 200, 5).observations;
  assert.equal(activeLearningSuggest(clean, "leafy").suggestions.length, 0);

  // 표본 수는 더 많지만 잡음이 훨씬 큰 데이터: 제안이 나와야 한다
  const noisy = generateObservations({ ...LEAFY_SPEC, noiseSd: 1.2 }, 240, 5).observations;
  const out = activeLearningSuggest(noisy, "leafy");
  assert.ok(out.suggestions.length > 0, `표본 240개 잡음 10배인데 제안이 없다: ${out.note}`);
  for (const g of out.suggestions) {
    assert.ok(g.uncertaintyRatio > 0.35);
    assert.ok(Number.isFinite(g.suggestValue));
  }
});

test("SHAP이 반응면에서 약한 요인을 맨 아래에 둔다", () => {
  const { observations } = generateObservations(LEAFY_SPEC, 120, 6);
  const shap = shapImportance(observations, "leafy");
  assert.equal(shap.length, 6);
  // pH는 합성 반응면에서 가장 약한 요인이다 — 순위 맨 아래여야 한다
  assert.equal(shap[shap.length - 1].feature, "ph");
  assert.ok(shap[0].meanAbsShap > shap[shap.length - 1].meanAbsShap * 2);
});
