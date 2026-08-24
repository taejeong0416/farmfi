import { strict as assert } from "node:assert";
import { test } from "node:test";

import { credentialNoFrom } from "./credential-qr";

test("번호만 담긴 QR", () => {
  assert.equal(credentialNoFrom("FC-2026-0001"), "FC-2026-0001");
  assert.equal(credentialNoFrom("  FC-2026-0001  "), "FC-2026-0001");
});

test("쿼리스트링에 실린 번호", () => {
  assert.equal(
    credentialNoFrom("https://farmfi.co.kr/operator/certificate?credentialNo=FC-2026-0007"),
    "FC-2026-0007",
  );
  // 다른 파라미터가 앞에 있어도 찾는다.
  assert.equal(credentialNoFrom("https://x/y?a=1&credentialNo=FC-2026-0009"), "FC-2026-0009");
});

test("경로에 실린 번호", () => {
  assert.equal(credentialNoFrom("https://farmfi.co.kr/certificate/FC-2026-0042"), "FC-2026-0042");
  assert.equal(credentialNoFrom("https://farmfi.co.kr/certificates/FC-2026-0042?x=1"), "FC-2026-0042");
});

test("퍼센트 인코딩을 푼다", () => {
  assert.equal(credentialNoFrom("https://x/y?credentialNo=FC%2D2026%2D0003"), "FC-2026-0003");
});

test("QR이 아닌 값은 거른다", () => {
  assert.equal(credentialNoFrom(""), null);
  assert.equal(credentialNoFrom("   "), null);
  // 사람이 읽는 문장은 번호가 아니다.
  assert.equal(credentialNoFrom("운영자 보증서입니다"), null);
});
