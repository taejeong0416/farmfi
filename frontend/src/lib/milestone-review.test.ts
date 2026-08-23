// 조건 항목별 판정 게이트 — 실행: npm test
//
// 명세 A-08의 주장은 "각 항목마다 충족·미충족과 근거가 된 증빙을 지정해야
// 승인 버튼이 열린다"이다. 그 주장이 서려면
//   · 하나라도 미판정이면 막혀야 하고
//   · 미충족이 있으면 승인이 아니라 보완·반려로 가야 하며
//   · 파일이 필요한 항목은 근거를 지정해야 하고
//   · 교차검증도 하나의 항목이어야 한다 (각각 통과해도 서로 안 맞을 수 있다).

import test from "node:test";
import assert from "node:assert/strict";

import { canApproveItems, reviewSignalsOf, SIGNAL_LABEL } from "./milestone-gate";

const FULL = ["contract", "receipt", "photo", "crossCheck"];
const ok = (signal: string, evidenceUrl?: string) => ({
  signal,
  verdict: "met",
  evidenceUrl: evidenceUrl ?? null,
});

test("교차검증이 걸린 단계는 그것도 하나의 항목이다", () => {
  const withCross = reviewSignalsOf({
    requiredSignals: ["receipt", "photo"],
    crossCheck: "receipt↔photo",
  });
  assert.deepEqual(withCross, ["receipt", "photo", "crossCheck"]);

  const without = reviewSignalsOf({ requiredSignals: ["iot"], crossCheck: null });
  assert.deepEqual(without, ["iot"]);
});

test("판정이 하나도 없으면 승인이 열리지 않는다", () => {
  const r = canApproveItems(FULL, []);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /판정하지 않은 항목/);
});

test("일부만 판정해도 막힌다 — 남은 항목 이름을 알려준다", () => {
  const r = canApproveItems(FULL, [ok("contract", "/a.jpg")]);
  assert.equal(r.ok, false);
  const msg = r.ok === false ? r.error : "";
  assert.match(msg, /영수증/);
  assert.match(msg, /현장 사진/);
  assert.doesNotMatch(msg, /계약서/, "이미 판정한 항목은 언급하지 않는다");
});

test("미충족 항목이 있으면 승인이 아니라 보완·반려로 보낸다", () => {
  const r = canApproveItems(FULL, [
    ok("contract", "/a.jpg"),
    { signal: "receipt", verdict: "unmet", evidenceUrl: "/b.jpg" },
    ok("photo", "/c.jpg"),
    ok("crossCheck"),
  ]);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /보완 요청 또는 반려/);
});

test("파일이 필요한 항목은 근거 증빙을 지정해야 한다", () => {
  const r = canApproveItems(FULL, [
    ok("contract", "/a.jpg"),
    ok("receipt"), // 근거 없음
    ok("photo", "/c.jpg"),
    ok("crossCheck"),
  ]);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /근거 증빙을 지정하지 않은/);
});

test("IoT·교차검증은 근거 파일을 요구하지 않는다 — 지정할 파일이 없다", () => {
  const r = canApproveItems(["iot", "crossCheck"], [ok("iot"), ok("crossCheck")]);
  assert.equal(r.ok, true);
});

test("전부 충족하고 근거가 있으면 열린다", () => {
  const r = canApproveItems(FULL, [
    ok("contract", "/a.jpg"),
    ok("receipt", "/b.jpg"),
    ok("photo", "/c.jpg"),
    ok("crossCheck"),
  ]);
  assert.equal(r.ok, true);
});

test("항목 이름이 사람이 읽는 말로 나온다 — 코드값이 그대로 새면 안 된다", () => {
  for (const sig of FULL) {
    assert.ok(SIGNAL_LABEL[sig], `${sig} 라벨이 없다`);
    assert.notEqual(SIGNAL_LABEL[sig], sig);
  }
  const r = canApproveItems(FULL, []);
  assert.doesNotMatch(r.ok === false ? r.error : "", /contract|receipt|photo|crossCheck/);
});
