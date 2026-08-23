// 운영자 보증서 유효성 — 실행: npm test
//
// 앱이 이 판정으로 운영 기능을 열고 닫는다(M-02). 그래서
//   · 만료는 저장된 status와 무관하게 시간이 정해야 하고
//   · 실패마다 "다음 행동"이 있어야 하며 (명세: 실패 화면에는 이유와 다음 행동)
//   · 정지와 만료가 갈려야 한다 (하나로 합치면 "왜 막혔나"에 답할 수 없다).

import test from "node:test";
import assert from "node:assert/strict";

import { checkCredential, credentialNo, SUSPEND_REASONS } from "./credential";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);
const past = (days: number) => new Date(Date.now() - days * 86_400_000);

test("유효한 보증서는 남은 기간을 알려준다", () => {
  const r = checkCredential({ status: "active", expiresAt: future(30) });
  assert.equal(r.valid, true);
  assert.equal(r.valid === true ? r.status : "", "active");
  assert.ok(r.valid === true && r.daysLeft >= 29 && r.daysLeft <= 30);
});

test("기간이 지나면 status가 active여도 막힌다 — 배치가 늦어도 권한이 새지 않는다", () => {
  const r = checkCredential({ status: "active", expiresAt: past(1) });
  assert.equal(r.valid, false);
  assert.equal(r.valid === false ? r.status : "", "expired");
});

test("정지와 만료가 갈린다 — 하나로 합치면 왜 막혔는지 알 수 없다", () => {
  const suspended = checkCredential({
    status: "suspended",
    expiresAt: future(30),
    statusNote: "8월 안전점검 미이수",
  });
  const expired = checkCredential({ status: "active", expiresAt: past(1) });
  assert.notEqual(
    suspended.valid === false ? suspended.status : "",
    expired.valid === false ? expired.status : "",
  );
});

test("정지 사유가 그대로 운영자에게 간다", () => {
  const r = checkCredential({
    status: "suspended",
    expiresAt: future(30),
    statusNote: "8월 안전점검 미이수",
  });
  assert.equal(r.valid, false);
  assert.match(r.valid === false ? r.reason : "", /안전점검/);
});

test("사유 메모가 없으면 코드에서 사람이 읽는 말을 만든다", () => {
  const r = checkCredential({
    status: "suspended",
    expiresAt: future(30),
    statusReason: "training_expired",
  });
  assert.equal(r.valid === false ? r.reason : "", SUSPEND_REASONS.training_expired);
});

test("해지는 되돌릴 수 없다는 것이 안내에 드러난다", () => {
  const r = checkCredential({ status: "revoked", expiresAt: future(30) });
  assert.equal(r.valid === false ? r.status : "", "revoked");
  assert.match(r.valid === false ? r.action : "", /관리자/);
});

test("모든 실패에 다음 행동이 있다 — 이유만 주면 운영자가 할 게 없다", () => {
  const cases = [
    { status: "revoked", expiresAt: future(30) },
    { status: "suspended", expiresAt: future(30) },
    { status: "active", expiresAt: past(1) },
  ];
  for (const c of cases) {
    const r = checkCredential(c);
    assert.equal(r.valid, false);
    assert.ok(r.valid === false && r.action.length > 0, `${c.status}에 다음 행동이 없다`);
  }
});

test("보증서 번호는 짧고 대문자다 — 전화로 부를 수 있어야 한다", () => {
  const no = credentialNo("cmt5a1b9504n704i8l32ht6m6", new Date(2026, 7, 23));
  assert.match(no, /^FF-2026-[A-Z0-9]{6}$/);
});
