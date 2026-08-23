// 구독 변경 마감 테스트 — 실행: npm test
//
// 마감은 "언제까지 되는가"보다 **경계에서 어느 쪽인가**가 중요하다. 3시간 정각과
// 결제일 전날 자정이 열려 있는지 닫혀 있는지가 갈리면 손님과 매장이 다른 답을 본다.

import test from "node:test";
import assert from "node:assert/strict";

import {
  canCancel,
  canChangePickup,
  cancelDeadline,
  pickupChangeDeadline,
} from "./subscription-window";

const at = (iso: string) => new Date(iso);

test("픽업 3시간 전 정각까지는 바꿀 수 있다", () => {
  const pickup = at("2026-08-24T15:00:00");
  assert.equal(canChangePickup(pickup, at("2026-08-24T12:00:00")).ok, true, "정각은 열려 있다");
  assert.equal(canChangePickup(pickup, at("2026-08-24T11:59:00")).ok, true);
});

test("3시간을 넘기면 닫히고 마감 시각을 알려준다", () => {
  const pickup = at("2026-08-24T15:00:00");
  const r = canChangePickup(pickup, at("2026-08-24T12:00:01"));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "PICKUP_CHANGE_CLOSED");
    assert.equal(r.deadline, pickupChangeDeadline(pickup).toISOString());
  }
});

test("해지 마감은 다음 결제일 전날 끝이다", () => {
  const billing = at("2026-09-10T00:00:00");
  const deadline = cancelDeadline(billing)!;
  assert.equal(deadline.getDate(), 9);
  assert.equal(deadline.getHours(), 23);

  assert.equal(canCancel(billing, at("2026-09-09T23:59:00")).ok, true, "전날은 열려 있다");
  assert.equal(canCancel(billing, at("2026-09-10T00:00:01")).ok, false, "결제일 당일은 닫힌다");
});

test("결제일 당일 해지는 사유와 마감을 함께 준다", () => {
  const r = canCancel(at("2026-09-10T00:00:00"), at("2026-09-10T09:00:00"));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "CANCEL_CLOSED");
    assert.ok(r.error.includes("다음 결제일 전날"));
  }
});

test("결제일이 잡히지 않은 구독은 언제든 해지된다", () => {
  // 청구가 없는데 마감을 만들면 해지할 방법이 없는 구독이 생긴다.
  assert.equal(canCancel(null).ok, true);
  assert.equal(cancelDeadline(null), null);
});

test("월이 바뀌는 결제일에도 전날을 제대로 잡는다", () => {
  const deadline = cancelDeadline(at("2026-09-01T00:00:00"))!;
  assert.equal(deadline.getMonth(), 7, "8월");
  assert.equal(deadline.getDate(), 31);
});
