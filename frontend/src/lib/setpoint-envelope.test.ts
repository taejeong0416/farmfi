// 설정점 봉투 테스트 — 실행: npm test
//
// 봉투의 주장은 "학습은 좁힐 수만 있고 넓힐 수 없다"이다. 그 주장이 서려면
//   · 범위 밖 산출이 경계로 잘려야 하고
//   · 반응면을 못 믿을 때는 아예 채택하지 않아야 하며
//   · 급변이 하루 폭으로 제한되어야 하고
//   · 어떤 경우에도 적용값이 허용 구간을 벗어나지 않아야 한다.

import test from "node:test";
import assert from "node:assert/strict";

import { applyEnvelope, envelopeBounds, type EnvelopeVerdict } from "./setpoint-envelope";
import { getCrop } from "./crop-profiles";
import type { GrowthRecipe, RecipeSetpoint, SurfaceVerdict } from "./growth-recipe";

function sp(
  feature: string,
  optimum: number,
  atBoundary = false,
  curvatureUnresolved = false,
): RecipeSetpoint {
  const unit: Record<string, string> = { temp: "℃", humidity: "%", co2: "ppm", ec: "dS/m", ph: "", dli: "mol" };
  return {
    feature,
    label: feature,
    optimum,
    current: optimum,
    unit: unit[feature] ?? "",
    atBoundary,
    curvatureUnresolved,
  };
}

function recipe(setpoints: RecipeSetpoint[], surface: SurfaceVerdict = "최대점") {
  return { recipe: setpoints, surface, samples: 40 } as Pick<GrowthRecipe, "recipe" | "surface" | "samples">;
}

const verdictOf = (r: ReturnType<typeof applyEnvelope>, f: string): EnvelopeVerdict =>
  r.decisions.find((d) => d.feature === f)!.verdict;
const appliedOf = (r: ReturnType<typeof applyEnvelope>, f: string): number =>
  r.decisions.find((d) => d.feature === f)!.applied;

test("범위 안 산출은 그대로 통과한다", () => {
  const r = applyEnvelope(recipe([sp("temp", 21)]), { cropKey: "leafy" });
  assert.equal(verdictOf(r, "temp"), "APPLIED");
  assert.equal(appliedOf(r, "temp"), 21);
});

test("농학 범위 밖 산출은 경계로 잘린다 — 넓히지 못한다", () => {
  const [lo, hi] = getCrop("leafy").healthyRanges.temperature;
  const hot = applyEnvelope(recipe([sp("temp", hi + 8)]), { cropKey: "leafy" });
  assert.equal(verdictOf(hot, "temp"), "CLAMPED_AGRONOMIC");
  assert.equal(appliedOf(hot, "temp"), hi);

  const cold = applyEnvelope(recipe([sp("temp", lo - 8)]), { cropKey: "leafy" });
  assert.equal(appliedOf(cold, "temp"), lo);
});

test("반응면이 안장이면 산출을 채택하지 않고 현행을 유지한다", () => {
  const r = applyEnvelope(recipe([sp("temp", 21)], "안장점"), {
    cropKey: "leafy",
    baseline: { temp: 22 },
  });
  assert.equal(verdictOf(r, "temp"), "REJECTED_SURFACE");
  assert.equal(appliedOf(r, "temp"), 22, "직전 적용값을 그대로 둔다");
  assert.equal(r.anyApplied, false);
});

test("판정불가도 채택하지 않는다 — 0은 '설명력 없음'과 뜻이 다르다", () => {
  const r = applyEnvelope(recipe([sp("temp", 21)], "판정불가"), { cropKey: "leafy" });
  assert.equal(verdictOf(r, "temp"), "REJECTED_SURFACE");
});

test("최적점이 탐색 경계에 붙으면 채택하지 않는다", () => {
  const r = applyEnvelope(recipe([sp("temp", 24, true)]), {
    cropKey: "leafy",
    baseline: { temp: 21 },
  });
  assert.equal(verdictOf(r, "temp"), "REJECTED_BOUNDARY");
  assert.equal(appliedOf(r, "temp"), 21);
});

test("급변은 하루 변화폭까지만 옮긴다", () => {
  const [lo, hi] = getCrop("leafy").healthyRanges.temperature;
  const r = applyEnvelope(recipe([sp("temp", hi)]), { cropKey: "leafy", baseline: { temp: lo } });
  assert.equal(verdictOf(r, "temp"), "CLAMPED_RATE");
  const moved = appliedOf(r, "temp") - lo;
  assert.ok(moved > 0, "방향은 목표 쪽이다");
  assert.ok(moved < hi - lo, "한 번에 다 가지 않는다");
});

test("pH가 온도보다 천천히 움직인다 — 과보정이 회복을 더 어렵게 한다", () => {
  const tempRange = getCrop("leafy").healthyRanges.temperature;
  const phRange = getCrop("leafy").healthyRanges.phLevel;
  const t = applyEnvelope(recipe([sp("temp", tempRange[1])]), {
    cropKey: "leafy", baseline: { temp: tempRange[0] },
  });
  const p = applyEnvelope(recipe([sp("ph", phRange[1])]), {
    cropKey: "leafy", baseline: { ph: phRange[0] },
  });
  const tFrac = (appliedOf(t, "temp") - tempRange[0]) / (tempRange[1] - tempRange[0]);
  const pFrac = (appliedOf(p, "ph") - phRange[0]) / (phRange[1] - phRange[0]);
  assert.ok(pFrac < tFrac, `pH ${pFrac.toFixed(3)} < 온도 ${tFrac.toFixed(3)}`);
});

test("첫 적용은 변화폭을 걸지 않는다 — 제한할 기준이 없다", () => {
  const r = applyEnvelope(recipe([sp("temp", 23)]), { cropKey: "leafy" });
  assert.equal(verdictOf(r, "temp"), "APPLIED");
  assert.equal(appliedOf(r, "temp"), 23);
});

test("DLI 상한은 설비가 낼 수 있는 최대를 넘지 않는다", () => {
  const crop = getCrop("leafy");
  const [, hi] = envelopeBounds("dli", crop)!;
  const ceiling = (crop.maxPpfd * crop.maxPhotoperiodH * 3600) / 1e6;
  assert.ok(hi <= ceiling + 1e-9, `봉투 상한 ${hi} ≤ 설비 최대 ${ceiling.toFixed(2)}`);
});

test("어떤 산출이 와도 적용값은 허용 구간을 벗어나지 않는다", () => {
  const crop = getCrop("leafy");
  const features = ["temp", "humidity", "co2", "ec", "ph", "dli"];
  for (const f of features) {
    const [lo, hi] = envelopeBounds(f, crop)!;
    for (const wild of [-9999, 0, lo - 1, hi + 1, 9999]) {
      const r = applyEnvelope(recipe([sp(f, wild)]), { cropKey: "leafy" });
      const v = appliedOf(r, f);
      assert.ok(v >= lo - 1e-6 && v <= hi + 1e-6, `${f}: 산출 ${wild} → 적용 ${v} (구간 ${lo}~${hi})`);
    }
  }
});

test("산출값과 적용값을 둘 다 남긴다 — 모델을 고칠 근거가 사라지면 안 된다", () => {
  const [, hi] = getCrop("leafy").healthyRanges.temperature;
  const r = applyEnvelope(recipe([sp("temp", hi + 5)]), { cropKey: "leafy" });
  const d = r.decisions[0];
  assert.equal(d.proposed, hi + 5);
  assert.equal(d.applied, hi);
  assert.notEqual(d.proposed, d.applied);
  assert.ok(d.reason.length > 0, "사유가 비어 있으면 안 된다");
});

test("품종이 바뀌면 봉투도 바뀐다", () => {
  const leafy = envelopeBounds("temp", getCrop("leafy"))!;
  const basil = envelopeBounds("temp", getCrop("basil"))!;
  assert.notDeepEqual(leafy, basil, "바질과 상추가 같은 온도 봉투를 쓰면 정규화한 게 아니다");
});

test("곡률이 안 잡힌 요인은 채택하지 않는다", () => {
  const r = applyEnvelope(recipe([sp("temp", 21, false, true)]), { cropKey: "leafy" });
  assert.equal(verdictOf(r, "temp"), "REJECTED_CURVATURE");
});
