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

test("평탄한 요인에 정점을 지어내지 않는다", () => {
  // pH 곡률을 잡음에 묻힐 만큼 낮춘다(폭 0.001kg/㎡ vs 잡음 0.12). 실제 pH 반응이
  // 이 모양에 가깝다 — 6.0 근처에서 양분 가용성이 평평하고 양 끝에서만 급격히
  // 나빠진다. 참 곡률이 거의 0이면 최소제곱은 잡음에 맞춰 이차항을 내고 그 부호를
  // 잡음이 정한다. 정확히 0으로 두면 테스트 베드 자체가 오목성을 잃어 회수의 기준이
  // 사라지므로 아주 작은 값을 남긴다.
  const flat: SynthSpec = { ...LEAFY_SPEC, quad: { ...LEAFY_SPEC.quad, ph: 0.004 } };
  const { observations } = generateObservations(flat, 200, 31);
  const fit = analyzeGrowthRecipe(observations, { cropKey: "leafy" });

  const ph = fit.recipe.find((r) => r.feature === "ph")!;
  assert.equal(ph.curvatureUnresolved, true, `pH 곡률이 0인데 정점을 냈다 (${ph.optimum})`);
  // 곡률이 있는 요인까지 싸잡아 끄면 안 된다
  assert.equal(fit.recipe.find((r) => r.feature === "temp")!.curvatureUnresolved, false);
  assert.match(fit.note, /곡률이 잡히지 않아/);

  // 그리고 갭 분석이 그 요인에 조작 지시를 내지 않는다
  const phAction = recipeGapAnalysis(fit, { ph: 5.6 }).actions.find((a) => a.label === ph.label)!;
  assert.equal(phAction.direction, "유지", `pH를 ${phAction.target}로 옮기라고 한다`);
  assert.equal(phAction.curvatureUnresolved, true);
});

test("열 스트레스 사이클이 온도 최적점을 끌어내리고, 가중이 되돌린다", () => {
  // 벌점은 주야 진폭에서 나오고 진폭은 평균과 독립으로 뽑히므로, 회귀는 이 손실을
  // 설명할 수 없다. 그런데 주간온도 = 평균 + 진폭/2이라 손실은 평균 온도와 함께
  // 커진다 — 그 결과 온도 최적점이 실제보다 낮게 끌려간다. 사이클 평균이 지운
  // 정보가 모델을 오염시키는 경로가 이것이다.
  const { observations, stressRate } = generateObservations(LEAFY_SPEC, 400, 12);
  assert.ok(stressRate > 0.15, `스트레스 사이클이 ${Math.round(stressRate * 100)}%뿐이라 검증이 성립하지 않는다`);

  const truth = trueOptimum(LEAFY_SPEC).temp;
  const tempOf = (obs: GrowthObservation[]) =>
    analyzeGrowthRecipe(obs, { cropKey: "leafy" }).recipe.find((r) => r.feature === "temp")!.optimum;

  // 표식을 지우면 가중치가 전부 1이 되어 보통의 최소제곱으로 돌아간다
  const unweighted = observations.map((o) => ({ ...o, tempExcessHours: undefined }));
  const biased = tempOf(unweighted);
  const corrected = tempOf(observations);

  assert.ok(biased < truth - 0.3, `오염이 재현되지 않았다 — 가중 없이 ${biased}℃ (정답 ${truth}℃)`);
  assert.ok(
    Math.abs(corrected - truth) < Math.abs(biased - truth),
    `가중이 오차를 줄이지 못했다 — 가중 ${corrected}℃ vs 무가중 ${biased}℃ (정답 ${truth}℃)`
  );
});

test("스트레스 가중이 기준시간에 민감하지 않다", () => {
  // 절반 무게가 되는 기준시간 24h는 작업 가정이다. 그 값을 바꿔도 온도 최적점이
  // 크게 흔들리지 않아야 이 가정이 결론을 좌우하지 않는다고 말할 수 있다.
  const { observations } = generateObservations(LEAFY_SPEC, 400, 12);
  const truth = trueOptimum(LEAFY_SPEC).temp;
  const scaled = (k: number) =>
    analyzeGrowthRecipe(
      observations.map((o) => ({ ...o, tempExcessHours: (o.tempExcessHours ?? 0) * k })),
      { cropKey: "leafy" }
    ).recipe.find((r) => r.feature === "temp")!.optimum;

  // 기준시간을 2배로 본 것(=초과시간 절반)과 절반으로 본 것(=초과시간 2배)
  for (const k of [0.5, 2]) {
    assert.ok(
      Math.abs(scaled(k) - truth) < 0.5,
      `기준시간을 ${k === 0.5 ? "2배" : "절반"}으로 잡으면 최적 온도가 ${scaled(k)}℃ (정답 ${truth}℃)`
    );
  }
});

test("주야 진폭이 큰 사이클을 플래그로 세고 권고에 붙인다", () => {
  // 진폭이 정상범위 폭(6℃)을 넘으면 그 사이클 평균은 대표값이 아니다.
  const { observations } = generateObservations(LEAFY_SPEC, 200, 12);
  const fit = analyzeGrowthRecipe(observations, { cropKey: "leafy" });
  assert.ok(fit.diurnalFlaggedShare > 0.2, `플래그 비율 ${fit.diurnalFlaggedShare}`);
  assert.match(fit.note, /주야 진폭/);

  const gap = recipeGapAnalysis(fit, { temp: 19, co2: 650 });
  assert.match(gap.headline, /온도곡선이 다르다/);

  // 진폭이 없는 관측에서는 플래그도 경고도 없다 — 모르는 것을 아는 척하지 않는다
  const noDif = observations.map((o) => ({ ...o, tempDiurnalAmpC: undefined }));
  const plain = analyzeGrowthRecipe(noDif, { cropKey: "leafy" });
  assert.equal(plain.diurnalFlaggedShare, 0);
  assert.doesNotMatch(recipeGapAnalysis(plain, { temp: 19 }).headline, /온도곡선/);
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
