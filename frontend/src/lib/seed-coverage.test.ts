// 리셋 삭제 목록 누락 검사 — 실행: npm test
//
// `seed-scenario.ts`가 새 모델을 빠뜨리면 부모 `deleteMany()`가 FK 위반으로
// 죽고 **데모 리셋 자체가 안 된다**. 세 번 났다.
//   ① 팀원 모델 14개  ② SetpointApplication  ③ MilestoneReviewItem
//
// ③은 앞선 버전의 이 테스트가 못 잡았다 — Project·User 참조만 봤는데
// MilestoneReviewItem은 Milestone을 참조한다. 부모가 지워지는 순간 그 자식도
// 걸리는데, "부모"를 두 모델로 좁힌 게 잘못이었다.
//
// 이제 **삭제 목록에 있는 모든 모델**을 부모로 보고, 그 자식이 목록에
// 있는지·더 먼저 지워지는지까지 본다. 순서가 뒤집혀도 FK로 죽는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
const seed = readFileSync(join(ROOT, "src", "lib", "seed-scenario.ts"), "utf8");

function models(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) out.set(m[1], m[2]);
  return out;
}

const clientName = (model: string) => model[0].toLowerCase() + model.slice(1);

/** 이 모델이 FK로 참조하는 모델들 — `@relation(fields: ...)`가 붙은 쪽이 자식이다. */
function parentsOf(body: string, known: Set<string>): string[] {
  const out = new Set<string>();
  for (const line of body.split("\n")) {
    if (!line.includes("@relation(fields:")) continue;
    const m = line.trim().match(/^\w+\s+(\w+)/);
    if (m && known.has(m[1])) out.add(m[1]);
  }
  return [...out];
}

/** 삭제 순서 — 등장 순서가 곧 실행 순서다. */
function deleteOrder(): Map<string, number> {
  const out = new Map<string, number>();
  const re = /prisma\.(\w+)\.deleteMany\(\)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(seed))) if (!out.has(m[1])) out.set(m[1], i++);
  return out;
}

test("삭제되는 모델의 자식도 함께, 그리고 더 먼저 삭제된다", () => {
  const all = models();
  const known = new Set(all.keys());
  const order = deleteOrder();
  const problems: string[] = [];

  for (const [child, body] of all) {
    const parents = parentsOf(body, known);
    for (const parent of parents) {
      // 부모가 안 지워지면 자식도 걸릴 일이 없다.
      if (!order.has(clientName(parent))) continue;

      const childCall = `prisma.${clientName(child)}.deleteMany()`;
      if (!order.has(clientName(child))) {
        problems.push(
          `${child} → ${childCall}  (부모 ${parent}가 지워지는데 자식이 목록에 없다)`,
        );
        continue;
      }
      if (order.get(clientName(child))! > order.get(clientName(parent))!) {
        problems.push(
          `${child}가 부모 ${parent}보다 뒤에 지워진다 — 순서를 앞으로 옮길 것`,
        );
      }
    }
  }

  assert.deepEqual(
    problems,
    [],
    `seed-scenario.ts의 삭제 목록을 고칠 것 (자식 → 부모 순서):\n  ${problems.join("\n  ")}`,
  );
});

test("삭제 목록의 모델이 실제로 스키마에 있다 — 이름이 바뀌면 조용히 안 지워진다", () => {
  const known = new Set([...models().keys()].map(clientName));
  const called = [...seed.matchAll(/prisma\.(\w+)\.deleteMany\(\)/g)].map((m) => m[1]);
  const unknown = called.filter((c) => !known.has(c));
  assert.deepEqual(unknown, [], `스키마에 없는 모델을 지우려 한다: ${unknown.join(", ")}`);
});
