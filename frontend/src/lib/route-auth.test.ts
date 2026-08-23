// 운영 데이터 라우트 인증 누락 검사 — 실행: npm test
//
// `sales/trend`·`monitoring/[projectId]`·`tasks/today`·`notifications`·
// `devices`·`schedules`가 **인증 없이 프로덕션에 열려 있었다.** projectId만
// 알면 남의 매장 센서 시계열이 그대로 나왔다.
//
// 사람이 라우트를 추가할 때마다 기억하는 방식이 안 통한다는 뜻이라,
// 소스를 읽어 검사한다. 매장 데이터를 다루는 라우트는 반드시
//   ① 세션 검사(requireRole/getServerSession/operatorGate)
//   ② 매장 소유 검사(guardProject/operatorGate/allowedProjectIds)
// 둘 다 있어야 한다. ①만 있으면 아무 운영자나 남의 매장을 연다.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API = join(import.meta.dirname, "..", "app", "api");

/** 매장 단위 데이터를 다루는 라우트 — projectId를 받거나 경로에 갖고 있다. */
const SCOPED = [
  "sales/route.ts",
  "sales/trend/route.ts",
  "inventory/route.ts",
  "monitoring/[projectId]/route.ts",
  "tasks/today/route.ts",
  "notifications/route.ts",
  "devices/route.ts",
  "schedules/route.ts",
  "products/route.ts",
  "pickups/route.ts",
  "pickups/[code]/route.ts",
  "pickups/[code]/complete/route.ts",
  "pickups/[code]/prepare/route.ts",
  "projects/[id]/setpoints/route.ts",
];

/**
 * 운영자 매장 게이트를 걸지 **않는** 라우트와 그 이유.
 * 예외는 여기 적어야 통과한다 — 조용히 빠지면 다음 사람이 알 수 없다.
 */
const NOT_OPERATOR_SCOPED: Record<string, string> = {
  // 구매자가 지점을 고르기 전에 보는 목록. 로그인 전에 보여야 하고,
  // 재고 수치 대신 "고를 수 있는지"만 내려준다.
  "subscriptions/catalog/route.ts": "구매 전 탐색용 공개 카탈로그",
  // 구매자 본인 구독. projectId는 픽업 지점 선택이지 운영 권한이 아니다.
  // 세션의 userId로 본인 것만 다룬다.
  "subscriptions/route.ts": "구매자 본인 구독 — 세션 userId 기준",
};

const AUTH = /requireRole\(|getServerSession\(|operatorGate\(/;
const SCOPE = /guardProject\(|operatorGate\(|allowedProjectIds\(|canAccessProject\(/;

for (const rel of SCOPED) {
  test(`${rel} — 세션과 매장 소유를 둘 다 검사한다`, () => {
    const src = readFileSync(join(API, rel), "utf8");
    assert.ok(AUTH.test(src), `${rel}: 세션 검사가 없다. 누구나 부를 수 있다`);
    assert.ok(SCOPE.test(src), `${rel}: 매장 소유 검사가 없다. 남의 매장이 열린다`);
  });
}

test("구매자 본인 데이터 라우트는 세션에서 userId를 가져온다", () => {
  // 클라이언트가 보낸 userId를 믿으면 남의 구독을 조회·변경할 수 있다(IDOR).
  const src = readFileSync(join(API, "subscriptions", "route.ts"), "utf8");
  assert.ok(AUTH.test(src), "subscriptions: 세션 검사가 없다");
  assert.ok(/session\.userId/.test(src), "subscriptions: userId를 세션에서 가져오지 않는다");
});

test("새 라우트가 projectId를 받으면 이 목록에 등록돼 있다", () => {
  const found: string[] = [];
  const walk = (dir: string, prefix = "") => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full, prefix ? `${prefix}/${name}` : name);
      } else if (name === "route.ts") {
        const rel = prefix ? `${prefix}/route.ts` : "route.ts";
        const src = readFileSync(full, "utf8");
        // projectId를 쿼리·본문에서 읽는 라우트만 본다.
        // admin·demo·webhook·cron은 별도 인증 체계라 제외한다.
        if (/^(admin|demo|webhooks|cron|ai|auth|identity)\//.test(rel)) continue;
        if (/searchParams\.get\("projectId"\)|b\.projectId|body\.projectId/.test(src)) {
          found.push(rel);
        }
      }
    }
  };
  walk(API);
  const missing = found.filter(
    (f) => !SCOPED.includes(f) && !(f in NOT_OPERATOR_SCOPED),
  );
  assert.deepEqual(
    missing,
    [],
    `projectId를 받는데 검사 목록에 없는 라우트가 있다. SCOPED에 추가하고 게이트를 걸 것:\n  ${missing.join("\n  ")}`,
  );
});
