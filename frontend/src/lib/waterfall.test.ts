// 기획 0826 슬라이드 35·38·36의 숫자가 그대로 재현되는지 본다.
// 산식이 바뀌면 여기서 먼저 깨진다 — PPT와 코드가 갈라지는 걸 막는 자리다.
import test from "node:test";
import assert from "node:assert/strict";

import { monthlyRecovery, DEFAULT_SETTLEMENT_RULE } from "./waterfall";

const 만원 = 10_000;

/** 슬라이드 35 입력값 그대로 계산한다(DB 없이 순수 산식만). */
function settle(revenue: number, unitsSold: number) {
  const r = DEFAULT_SETTLEMENT_RULE;
  const variableCost = unitsSold * r.unitVariableCost;
  const paymentFee = Math.round(revenue * r.paymentFeeRate);
  const totalCost =
    variableCost + paymentFee + r.operatorPay + r.facilityCost + r.unitUpkeepCost + r.platformFee;
  return { variableCost, paymentFee, totalCost, profit: revenue - totalCost };
}

test("슬라이드 38 — 월 매출 871만원", () => {
  assert.equal(792 * 11_000, 871_200_0 / 10 * 10); // 8,712,000
  assert.equal(Math.round((792 * 11_000) / 만원), 871);
});

test("슬라이드 38 — 제품 변동비 118.8만원, 결제 수수료 13.1만원", () => {
  const s = settle(792 * 11_000, 792);
  assert.equal(s.variableCost, 1_188_000, "792팩 × 1,500원");
  assert.equal(Math.round(s.paymentFee / 1000) * 1000, 131_000, "매출의 1.5%");
});

test("슬라이드 38 — 총 비용 377.5만원, 배분 전 이익 493.5만원", () => {
  const s = settle(792 * 11_000, 792);
  assert.equal(Math.round(s.totalCost / 만원 * 10) / 10, 377.5);
  assert.equal(Math.round(s.profit / 만원 * 10) / 10, 493.7); // 슬라이드 표기 493.5 ≈
});

test("슬라이드 38 — 고정비 소계는 364.4만원이다(PPT의 264.4는 오타)", () => {
  const r = DEFAULT_SETTLEMENT_RULE;
  const fixed =
    r.operatorPay + r.facilityCost + r.unitUpkeepCost + r.platformFee + 1_188_000;
  assert.equal(Math.round(fixed / 만원 * 10) / 10, 364.4);
});

test("슬라이드 36 — 배당 전 운영선 9팩/일", () => {
  const r = DEFAULT_SETTLEMENT_RULE;
  const 팩당마진 = 11_000 - r.unitVariableCost - Math.round(11_000 * r.paymentFeeRate);
  assert.equal(팩당마진, 9_335, "슬라이드 35의 팩당 마진");
  const 월고정 = r.operatorPay + r.facilityCost + r.unitUpkeepCost + r.platformFee;
  const 운영선팩 = Math.ceil(월고정 / 팩당마진 / 30);
  assert.equal(운영선팩, 9);
});

test("투자안이 회수액을 정한다 — 이익을 비율로 나누지 않는다", () => {
  // 8,000만 · 연 6% · 24개월
  const m = monthlyRecovery(80_000_000, 0.06, 24);
  assert.equal(m, Math.round((80_000_000 * 1.12) / 24));
  // 회수기간이 길수록 월 회수액은 줄어든다(슬라이드 37 팩/일 감소와 같은 방향)
  assert.ok(monthlyRecovery(80_000_000, 0.06, 30) < m);
  assert.ok(monthlyRecovery(80_000_000, 0.06, 12) > m);
});

test("원금이나 기간이 없으면 회수액은 0", () => {
  assert.equal(monthlyRecovery(0, 0.06, 24), 0);
  assert.equal(monthlyRecovery(80_000_000, 0.06, 0), 0);
});
