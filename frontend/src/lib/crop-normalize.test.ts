// 품종 좌표계 테스트 — 실행: npm test
//
// 이 좌표계의 주장은 "품종이 달라도 사이트 편차는 이전된다"이다. 그 주장이 서려면
//   · 좌표 변환이 손실 없이 왕복해야 하고
//   · 같은 물리값이 품종에 따라 다른 z로 가야 하며 (안 그러면 정규화한 게 아니다)
//   · 유사도가 재배 상식과 같은 순서를 내야 한다.

import test from "node:test";
import assert from "node:assert/strict";

import {
  toNormalized,
  fromNormalized,
  cropSimilarity,
  transferWeight,
  featureScale,
  FACTOR_TRANSFER,
} from "./crop-normalize";
import { FEATURES } from "./growth-recipe";
import { getCrop } from "./crop-profiles";

const SAMPLE = { temp: 22, humidity: 70, co2: 900, ec: 1.5, ph: 6.0, dli: 16, yield: 4.1 };

test("정규화 좌표가 왕복한다", () => {
  const z = toNormalized(SAMPLE, "leafy");
  const back = fromNormalized(z, "leafy");
  for (const f of FEATURES) {
    assert.ok(Math.abs(back[f] - SAMPLE[f]) < 1e-9, `${f} 왕복 실패`);
  }
});

test("문헌 최적이 z=0, 정상범위 경계가 z=±1이다", () => {
  const crop = getCrop("leafy");
  for (const f of FEATURES) {
    const { mid, half } = featureScale(crop, f);
    const atMid = toNormalized({ ...SAMPLE, [f]: mid }, "leafy")[FEATURES.indexOf(f)];
    const atEdge = toNormalized({ ...SAMPLE, [f]: mid + half }, "leafy")[FEATURES.indexOf(f)];
    assert.ok(Math.abs(atMid) < 1e-9, `${f}: 문헌 최적이 z=0이 아니다`);
    assert.ok(Math.abs(atEdge - 1) < 1e-9, `${f}: 범위 경계가 z=1이 아니다`);
  }
});

test("같은 22℃가 상추와 바질에서 다른 z로 간다", () => {
  const iL = FEATURES.indexOf("temp");
  const zLeafy = toNormalized(SAMPLE, "leafy")[iL]; // 정상범위 18~24
  const zBasil = toNormalized(SAMPLE, "basil")[iL]; // 정상범위 20~26
  assert.ok(zLeafy > 0, "상추에겐 22℃가 최적보다 높은 쪽이어야 한다");
  assert.ok(zBasil < 0, "바질에겐 22℃가 최적보다 낮은 쪽이어야 한다");
});

test("사이트 편차가 품종을 건너 설정점으로 옮겨간다", () => {
  // 상추에서 "문헌보다 0.5σ 낮은 데서 잘 나온다"를 배웠다면,
  // 바질에서는 바질의 기준으로 0.5σ 낮은 값이 나와야 한다.
  const bias = FEATURES.map((f) => (f === "temp" ? -0.5 : 0));
  const leafyPoint = fromNormalized(bias, "leafy");
  const basilPoint = fromNormalized(bias, "basil");
  assert.equal(leafyPoint.temp, 21 - 1.5); // mid 21, half 3
  assert.equal(basilPoint.temp, 23 - 1.5); // mid 23, half 3
  assert.notEqual(leafyPoint.temp, basilPoint.temp);
});

test("유사도가 재배 상식과 같은 순서를 낸다", () => {
  const selfSim = cropSimilarity("leafy", "leafy");
  const toMicro = cropSimilarity("leafy", "microgreen");
  const toBasil = cropSimilarity("leafy", "basil");
  const toTomato = cropSimilarity("leafy", "cherryTomato");

  assert.equal(selfSim, 1);
  assert.ok(toMicro > toTomato, `상추-마이크로그린(${toMicro}) > 상추-토마토(${toTomato})`);
  assert.ok(toBasil > toTomato, `상추-바질(${toBasil}) > 상추-토마토(${toTomato})`);
  assert.ok(toTomato < 0.3, `과채류로의 이전이 너무 세다 (${toTomato})`);
  // 대칭이어야 한다
  assert.equal(toBasil, cropSimilarity("basil", "leafy"));
});

test("이전계수가 요인마다 다르고 pH가 가장 세다", () => {
  const ordered = FEATURES.map((f) => ({ f, w: FACTOR_TRANSFER[f].weight })).sort(
    (a, b) => b.w - a.w
  );
  assert.equal(ordered[0].f, "ph");
  assert.equal(ordered[ordered.length - 1].f, "dli");
  // 같은 품종이면 요인과 무관하게 완전 승계
  for (const f of FEATURES) assert.equal(transferWeight("leafy", "leafy", f), 1);
  // 다른 품종이면 요인별로 갈린다
  assert.ok(transferWeight("leafy", "basil", "ph") > transferWeight("leafy", "basil", "dli"));
  // 먼 품종일수록 약하다
  assert.ok(
    transferWeight("leafy", "basil", "temp") > transferWeight("leafy", "cherryTomato", "temp")
  );
});
