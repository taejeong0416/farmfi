// 실 관측 접기 테스트 — 실행: npm test
//
// 이 파일이 지키는 것은 하나다: **사이클을 한 행으로 접을 때 거짓말을 만들지 않는다.**
//   · 명기가 없는 시간대를 평균에 섞어 광량을 낮추지 않는다
//   · 진폭을 잴 수 없을 때 0으로 채우지 않는다 (0은 "내내 같았다"는 주장이다)
//   · 상한 초과 시간이 측정 간격을 반영한다
//   · EC를 지어내지 않는다

import test from "node:test";
import assert from "node:assert/strict";

import { __foldCycleForTest as foldCycle, resolveEcColumn } from "./growth-observations";
import type { GrowthObservation } from "./growth-recipe";
import { getCrop, luxToDli } from "./crop-profiles";

/** 지정한 시각·값으로 측정 한 줄. */
function r(
  hour: number,
  over: Partial<{
    temperature: number;
    humidity: number;
    co2Level: number;
    lightIntensity: number;
    phLevel: number;
    ecLevel: number | null;
  }> = {},
) {
  return {
    temperature: 22,
    humidity: 65,
    co2Level: 800,
    lightIntensity: 0,
    phLevel: 6,
    ecLevel: 1.5 as number | null,
    recordedAt: new Date(2026, 0, 1 + Math.floor(hour / 24), hour % 24, 0, 0),
    ...over,
  };
}

test("명기 조도만 DLI로 적산한다 — 소등 시간이 광량을 끌어내리지 않는다", () => {
  // 12시간 명기(10,000 lux) + 12시간 암기(0 lux), 1시간 간격
  const readings = [
    ...Array.from({ length: 12 }, (_, i) => r(6 + i, { lightIntensity: 10_000 })),
    ...Array.from({ length: 12 }, (_, i) => r(18 + i, { lightIntensity: 0 })),
  ];
  const o = foldCycle(readings, 10, "leafy");

  // 하루짜리 사이클이므로 명기 12시간 × 10,000 lux가 그대로 하루 DLI다.
  const expected = luxToDli(10_000, 12);
  assert.ok(
    Math.abs(o.dli - expected) < 0.5,
    `DLI ${o.dli.toFixed(2)} ≈ ${expected.toFixed(2)}`,
  );
  // 24시간 평균(5,000 lux)으로 적산했다면 절반이 나온다.
  assert.ok(o.dli > expected * 0.8, "암기를 평균에 섞으면 안 된다");
});

test("주야 진폭은 두 시간대가 다 있을 때만 낸다", () => {
  const both = foldCycle(
    [
      ...Array.from({ length: 12 }, (_, i) => r(6 + i, { temperature: 26 })),
      ...Array.from({ length: 12 }, (_, i) => r(18 + i, { temperature: 18 })),
    ],
    10,
    "leafy",
  );
  assert.equal(both.tempDiurnalAmpC, 8);

  // 명기 측정만 있으면 진폭을 말할 수 없다. 0으로 채우면 "내내 같았다"가 된다.
  const dayOnly = foldCycle(
    Array.from({ length: 12 }, (_, i) => r(6 + i, { temperature: 26 })),
    10,
    "leafy",
  );
  assert.equal(dayOnly.tempDiurnalAmpC, undefined);
});

test("상한 초과 시간은 측정 간격을 곱한 값이다", () => {
  const upper = getCrop("leafy").healthyRanges.temperature[1];
  // 2시간 간격으로 6개, 그중 3개가 상한 초과 → 3 × 2h = 6h
  const readings = [0, 2, 4, 6, 8, 10].map((h, i) =>
    r(h, { temperature: i < 3 ? upper + 5 : upper - 2 }),
  );
  const o = foldCycle(readings, 10, "leafy");
  assert.equal(o.tempExcessHours, 6);
});

test("EC 측정이 하나도 없으면 값을 지어내지 않는다", () => {
  const readings = Array.from({ length: 6 }, (_, i) => r(i, { ecLevel: null }));
  const o = foldCycle(readings, 10, "leafy");
  assert.ok(Number.isNaN(o.ec), "결측은 NaN으로 남아 호출자가 걸러낸다");
});

test("EC가 일부만 측정돼도 측정된 값만 평균한다", () => {
  const readings = [
    r(0, { ecLevel: 1.0 }),
    r(1, { ecLevel: null }),
    r(2, { ecLevel: 2.0 }),
  ];
  const o = foldCycle(readings, 10, "leafy");
  assert.equal(o.ec, 1.5, "결측을 0으로 세면 1.0이 된다");
});

test("수확량은 면적으로 나눠 들어온다", () => {
  const readings = Array.from({ length: 4 }, (_, i) => r(i));
  assert.equal(foldCycle(readings, 120 / 40, "leafy").yield, 3);
});

// ── EC 결측 처리 (이 단위의 결정) ────────────────────────────────────────────

/** EC만 다른 관측 한 줄. 나머지 값은 결정과 무관하다. */
function obs(ec: number): GrowthObservation {
  return {
    temp: 22, humidity: 65, co2: 800, ec, ph: 6, dli: 15,
    yield: 3, cropKey: "leafy",
  };
}

test("EC 측정이 충분하면 결측 사이클만 버리고 6요인으로 간다", () => {
  const rows = [obs(1.2), obs(1.5), obs(1.8), obs(1.4), obs(Number.NaN)];
  const r = resolveEcColumn(rows);
  assert.equal(r.droppedFeatures.length, 0);
  assert.equal(rows.length, 4, "결측 한 줄만 빠진다");
  assert.ok(rows.every((o) => Number.isFinite(o.ec)));
});

test("EC 측정이 모자라면 행이 아니라 열을 뺀다", () => {
  const rows = [obs(1.5), obs(Number.NaN), obs(Number.NaN), obs(Number.NaN)];
  const r = resolveEcColumn(rows);
  assert.deepEqual(r.droppedFeatures, ["ec"]);
  assert.equal(rows.length, 4, "나머지 다섯 요인을 살리려 행은 유지한다");
  // 모든 행이 같은 값 = 분산 0. 곡률이 잡히지 않아 파이프라인이 EC를 스스로 뺀다.
  assert.equal(new Set(rows.map((o) => o.ec)).size, 1);
});

test("EC를 아무도 안 쟀어도 나머지 요인의 학습은 살아 있다", () => {
  const rows = [obs(Number.NaN), obs(Number.NaN), obs(Number.NaN)];
  resolveEcColumn(rows);
  assert.equal(rows.length, 3, "0행이 되면 온도·습도까지 통째로 꺼진다");
});
