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
} from "./growth-recipe-advanced";
import {
  LEAFY_SPEC,
  SYNTH_FEATURES,
  generateObservations,
  trueYield,
  type SynthSpec,
  type SynthFeature,
} from "./growth-recipe-synth";
import { analyzeGrowthRecipe, zBounds } from "./growth-recipe";
import { toNormalized, fromNormalized } from "./crop-normalize";
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
  const done = activeLearningSuggest(clean, "leafy");
  assert.equal(done.suggestions.length, 0);
  assert.equal(done.assignment, null, "흔들 축이 없는데 배정이 나왔다");

  // 표본 수는 더 많지만 잡음이 훨씬 큰 데이터: 제안이 나와야 한다
  const noisy = generateObservations({ ...LEAFY_SPEC, noiseSd: 1.2 }, 240, 5).observations;
  const out = activeLearningSuggest(noisy, "leafy");
  assert.ok(out.suggestions.length > 0, `표본 240개 잡음 10배인데 제안이 없다: ${out.note}`);
  for (const g of out.suggestions) {
    assert.ok(g.uncertaintyRatio > 0.35);
    assert.ok(Number.isFinite(g.suggestValue));
  }
});

test("처리 배정의 방향이 데이터가 아니라 동전에서 나온다", () => {
  // 방향을 "관측이 성긴 쪽"으로 고정하면 배정이 관측에 의존하고, 그러면 계절과
  // 다시 엮여 무작위화가 무의미해진다. 같은 데이터에 시드만 바꿔 상향·하향이
  // 모두 나와야 한다.
  const noisy = generateObservations({ ...LEAFY_SPEC, noiseSd: 2.5 }, 240, 5).observations;
  const dirs = new Set<string>();
  const feats = new Set<string>();
  let eligible = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const out = activeLearningSuggest(noisy, "leafy", { seed });
    eligible = out.suggestions.length;
    if (!out.assignment) continue;
    dirs.add(out.assignment.direction);
    feats.add(out.assignment.feature);
    // 농학 정상범위 밖으로는 배정하지 않는다
    assert.ok(
      Math.abs(out.assignment.z) <= 1 + 1e-9,
      `${out.assignment.feature} 배정 z=${out.assignment.z} — 정상범위 밖이다`
    );
  }
  assert.equal(dirs.size, 2, `방향이 한쪽으로 고정됐다: ${[...dirs].join(",")}`);
  assert.ok(eligible > 1, `추첨 대상이 ${eligible}개뿐이라 요인 다양성을 확인할 수 없다`);
  assert.ok(feats.size > 1, `대상이 ${eligible}개인데 배정은 ${[...feats].join(",")}로 고정됐다`);
});

test("수율 손실이 큰 축은 흔들지 않는다", () => {
  const noisy = generateObservations({ ...LEAFY_SPEC, noiseSd: 1.2 }, 240, 5).observations;
  const fit = analyzeGrowthRecipe(noisy, { cropKey: "leafy" });
  for (let seed = 1; seed <= 40; seed++) {
    const a = activeLearningSuggest(noisy, "leafy", { seed, fit }).assignment;
    if (!a) continue;
    assert.ok(
      a.expectedYieldCostPct <= 1.0,
      `${a.label}을 흔들면 ${a.expectedYieldCostPct}% 손해인데 배정됐다`
    );
  }
});

test("표식 없는 관측에서는 인과 주장을 하지 않는다", () => {
  const obs = generateObservations({ ...LEAFY_SPEC, noiseSd: 1.2 }, 240, 5).observations;
  const before = activeLearningSuggest(obs, "leafy", { seed: 3 });
  assert.equal(before.randomizedShare, 0);
  assert.match(before.note, /가설/);

  // 절반에 배정 표식을 붙이면 비율이 따라 오르고 문장이 바뀐다
  const marked = obs.map((o, i) =>
    i % 2 === 0 ? { ...o, assignment: { feature: "temp" as const, z: 0.4 } } : o
  );
  const after = activeLearningSuggest(marked, "leafy", { seed: 3 });
  assert.equal(after.randomizedShare, 0.5);
  // 인과 주장은 배정이 붙은 **요인**까지만 간다. 행의 절반에 표식이 있어도
  // 무작위화된 것은 온도 하나뿐이므로, 문장이 "관측의 50%"가 아니라 요인을 짚어야 한다.
  assert.match(after.note, /온도 120회/);
  assert.match(after.note, /나머지는 관측이다/);
  assert.doesNotMatch(after.note, /관측의 50%/);
});

test("표면 민감도 순위가 참 반응면의 순위와 맞는다", () => {
  // 별도 트리 모델의 SHAP은 이 순위를 n=120에서 분해하지 못했다 — 중간 밴드가
  // 표본 잡음으로 뒤집혔다. 반응표면에서 직접 뽑으면 순위 전체가 복원된다.
  const { observations } = generateObservations(LEAFY_SPEC, 120, 6);
  const { sensitivity } = analyzeGrowthRecipe(observations, { cropKey: "leafy" });
  assert.equal(sensitivity.length, 6);

  // 참값도 모델이 실제로 판단하는 상자(농학 정상범위 ∩ 관측범위)에서 잰다.
  // 다른 상자에서 재면 "곡률은 큰데 좁게만 본다"를 크다고 세게 된다.
  const zb = zBounds(observations.map((o) => toNormalized(o, "leafy")), true);
  const lo = fromNormalized(zb.map((b) => b[0]), "leafy");
  const hi = fromNormalized(zb.map((b) => b[1]), "leafy");
  const mid = Object.fromEntries(
    SYNTH_FEATURES.map((k) => [k, (lo[k] + hi[k]) / 2])
  ) as Record<SynthFeature, number>;

  const trueSensitivity = (f: SynthFeature): number => {
    let min = Infinity;
    let max = -Infinity;
    for (let s = 0; s <= 200; s++) {
      const v = trueYield(LEAFY_SPEC, { ...mid, [f]: lo[f] + ((hi[f] - lo[f]) * s) / 200 });
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    return max - min;
  };

  const truthOrder = [...SYNTH_FEATURES].sort((a, b) => trueSensitivity(b) - trueSensitivity(a));
  assert.deepEqual(
    sensitivity.map((s) => s.feature),
    truthOrder,
    `추정 ${sensitivity.map((s) => `${s.feature}:${s.range}`).join(" ")} vs 참 ${truthOrder.join(" ")}`
  );

  // 폭 자체도 참값과 같은 규모여야 한다 — 순위만 맞고 크기가 틀리면 못 쓴다
  for (const s of sensitivity) {
    const truth = trueSensitivity(s.feature as SynthFeature);
    assert.ok(
      Math.abs(s.range - truth) < 0.3 * truth,
      `${s.feature}: 추정 폭 ${s.range} vs 참 폭 ${Math.round(truth * 1000) / 1000}`
    );
  }
  // 몫은 합이 1이다
  const shareSum = sensitivity.reduce((a, s) => a + s.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 0.01, `몫 합계 ${shareSum}`);
});
