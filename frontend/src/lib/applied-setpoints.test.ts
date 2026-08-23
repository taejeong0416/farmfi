// 학습값 → 판정 연결 (W1) — 실행: npm test
//
// 주장은 "학습이 판정을 옮기되, 좁힐 수만 있고 넓힐 수 없다"이다. 그 주장이 서려면
//   · 적용값 근처로 최적대가 좁혀져야 하고
//   · 어떤 경우에도 문헌 범위를 벗어나면 안 되며
//   · 규칙이 손댄 값(클램프·거부)은 최적대 중심이 되면 안 되고
//   · 적용 이력이 없으면 문헌값 그대로여야 한다.

import test from "node:test";
import assert from "node:assert/strict";

import { deriveRanges } from "./applied-setpoints";
import { getCrop } from "./crop-profiles";

const CROP = "leafy";
const lit = getCrop(CROP).healthyRanges;
const applied = (feature: string, value: number, verdict = "APPLIED") => ({
  feature,
  applied: value,
  verdict,
});

test("적용 이력이 없으면 문헌값 그대로다", () => {
  const r = deriveRanges(CROP, null);
  assert.equal(r.source, "literature");
  assert.deepEqual(r.optimal.temperature, lit.temperature);
  assert.equal(r.dliTarget, getCrop(CROP).dliTarget);
  assert.deepEqual(r.narrowed, []);
});

test("적용값 근처로 최적대가 좁혀진다", () => {
  const mid = (lit.temperature[0] + lit.temperature[1]) / 2;
  const r = deriveRanges(CROP, [applied("temp", mid)]);
  const [lo, hi] = r.optimal.temperature;
  assert.ok(hi - lo < lit.temperature[1] - lit.temperature[0], "문헌보다 좁아야 한다");
  assert.ok(lo < mid && mid < hi, "적용값이 안에 있어야 한다");
  assert.deepEqual(r.narrowed, ["temp"]);
  assert.equal(r.source, "applied");
});

test("어떤 적용값이 와도 문헌 범위를 벗어나지 않는다 — 학습이 넓히지 못한다", () => {
  for (const v of [-999, lit.temperature[0], lit.temperature[1], 999]) {
    const r = deriveRanges(CROP, [applied("temp", v)]);
    const [lo, hi] = r.optimal.temperature;
    assert.ok(lo >= lit.temperature[0] - 1e-9, `하한 ${lo} < 문헌 ${lit.temperature[0]}`);
    assert.ok(hi <= lit.temperature[1] + 1e-9, `상한 ${hi} > 문헌 ${lit.temperature[1]}`);
  }
});

test("규칙이 손댄 값은 최적대 중심이 되지 않는다", () => {
  // 클램프·거부된 값은 "규칙이 잘라낸 자리"지 이 매장의 최적이 아니다.
  for (const verdict of [
    "CLAMPED_AGRONOMIC",
    "CLAMPED_EQUIPMENT",
    "CLAMPED_RATE",
    "REJECTED_SURFACE",
    "REJECTED_BOUNDARY",
    "REJECTED_INVALID",
  ]) {
    const r = deriveRanges(CROP, [applied("temp", 20, verdict)]);
    assert.deepEqual(r.optimal.temperature, lit.temperature, `${verdict}가 최적대를 옮겼다`);
    assert.deepEqual(r.narrowed, []);
  }
});

test("목표 DLI도 적용값을 따라간다", () => {
  const target = getCrop(CROP).dliTarget;
  const r = deriveRanges(CROP, [applied("dli", target - 2)]);
  assert.equal(r.dliTarget, target - 2);
  assert.ok(r.narrowed.includes("dli"));
});

test("여러 요인을 함께 좁힌다 — 판정에 쓰이지 않는 요인은 무시한다", () => {
  const r = deriveRanges(CROP, [
    applied("temp", 21),
    applied("humidity", 70),
    applied("ec", 1.5), // 센서 판정 대상이 아니다
  ]);
  assert.ok(r.narrowed.includes("temp"));
  assert.ok(r.narrowed.includes("humidity"));
  assert.ok(!r.narrowed.includes("ec"));
});

test("숫자가 아닌 적용값은 무시한다", () => {
  const r = deriveRanges(CROP, [applied("temp", Number.NaN)]);
  assert.deepEqual(r.optimal.temperature, lit.temperature);
});
