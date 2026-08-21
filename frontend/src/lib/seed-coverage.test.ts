// 리셋 삭제 목록 누락 검사 — 실행: npm test
//
// `seed-scenario.ts`가 새 모델을 빠뜨리면 `project.deleteMany()`가 FK 위반으로
// 죽고 **데모 리셋 자체가 안 된다**. 실제로 두 번 났다: 팀원과 내가 모델을
// 추가할 때마다 삭제 목록을 잊었다.
//
// 사람이 기억하는 대신 스키마와 코드를 대조한다. Project나 User를 참조하는
// 모델은 반드시 삭제 목록에 있어야 한다 — 그것들이 FK로 막는 쪽이다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
const seed = readFileSync(join(ROOT, "src", "lib", "seed-scenario.ts"), "utf8");

/** 모델명 → 그 블록 본문 */
function models(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) out.set(m[1], m[2]);
  return out;
}

/** prisma 클라이언트 프로퍼티명 — 첫 글자만 소문자 */
function clientName(model: string): string {
  return model[0].toLowerCase() + model.slice(1);
}

test("Project·User를 참조하는 모델은 전부 리셋 삭제 목록에 있다", () => {
  const missing: string[] = [];
  for (const [name, body] of models()) {
    if (name === "Project" || name === "User") continue;
    // 관계 필드가 Project/User를 가리키면 그 모델이 삭제를 막는다.
    const refs = /@relation\(fields:/.test(body) && /\b(Project|User)\s/.test(body);
    if (!refs) continue;
    const call = `prisma.${clientName(name)}.deleteMany()`;
    if (!seed.includes(call)) missing.push(`${name} → ${call}`);
  }
  assert.deepEqual(
    missing,
    [],
    `리셋에서 빠진 모델이 있다. seed-scenario.ts의 삭제 목록에 자식→부모 순서로 추가할 것:\n  ${missing.join("\n  ")}`,
  );
});

test("삭제 목록의 모델이 실제로 스키마에 있다 — 이름이 바뀌면 조용히 안 지워진다", () => {
  const known = new Set([...models().keys()].map(clientName));
  const called = [...seed.matchAll(/prisma\.(\w+)\.deleteMany\(\)/g)].map((m) => m[1]);
  const unknown = called.filter((c) => !known.has(c));
  assert.deepEqual(unknown, [], `스키마에 없는 모델을 지우려 한다: ${unknown.join(", ")}`);
});
