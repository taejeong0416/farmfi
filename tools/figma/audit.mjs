// 도면 문구 ↔ 실제 렌더 대조. `npm run dev`를 띄운 상태에서:
//
//     python tools/figma/labels.py
//     node tools/figma/audit.mjs
//
// 화면마다 도면의 고정 문구가 브라우저에 실제로 그려지는지 센다. 빠진 문구가
// 곧 도면과 코드의 차이다 — 화면을 눈으로 하나씩 대조하는 대신 이 숫자를 본다.
//
// 데이터가 없어 빈 상태로 그려지는 화면은 문구가 통째로 빠진 것처럼 보인다.
// 먼저 `npm run seed`로 시나리오를 넣고, 필요하면 아래 ID를 그때 값으로 바꾼다.
//
// playwright가 필요하다: npm i -D playwright && npx playwright install chromium

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// playwright는 frontend의 devDependency다. 이 파일이 tools/에 있어 기본 해석으로는
// 못 찾으므로 frontend 기준으로 직접 찾는다.
const require = createRequire(path.join(HERE, "..", "..", "frontend", "package.json"));
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const labels = JSON.parse(fs.readFileSync(path.join(HERE, "labels.json"), "utf8"));

// 동적 경로에 쓸 ID. 시드를 다시 넣으면 바뀌므로 `--ids` 파일로 넘길 수 있다.
const ids = JSON.parse(
  process.env.AUDIT_IDS ??
    fs.readFileSync(path.join(HERE, "audit-ids.json"), "utf8"),
);
const { P1, P2, P3, M1, PICKUP } = ids;

const ROUTES = {
  "C-01": ["investor", "/"],
  "C-02": ["guest", "/login"],
  "C-03": ["guest", "/signup"],
  "C-04": ["investor", "/start"],
  "C-I01": ["investor", "/verify"],
  "C-I02": ["investor", "/verify/mobile-id"],
  "C-I03": ["investor", "/verify/account"],
  "C-I05": ["investor", "/verify/done"],
  "I-01": ["investor", `/projects/${P3}`],
  "I-02": ["investor", `/projects/${P3}/invest/eligibility`],
  "I-05": ["investor", "/investor/applications"],
  "I-06": ["investor", "/investor"],
  "I-07": ["investor", "/investor/holdings"],
  "I-09": ["investor", "/investor/notifications"],
  "I-10": ["investor", "/investor/notifications/settings"],
  "B-01": ["investor", "/subscribe"],
  "B-02": ["investor", "/subscribe/plan"],
  "B-04": ["investor", "/subscribe/order"],
  "B-05": ["investor", "/subscribe/payment"],
  "B-06": ["investor", "/subscribe/done"],
  "B-07": ["investor", "/subscriptions"],
  "B-08": ["investor", "/subscriptions/change"],
  "B-09": ["investor", `/subscriptions/pickup/${PICKUP}`],
  "O-01": ["operator", "/operator/spaces"],
  "O-02": ["operator", `/operator/spaces/${P3}`],
  "O-03": ["operator", "/operator/apply"],
  "O-04": ["operator", "/operator/apply/visit"],
  "O-05": ["operator", "/operator/apply/education"],
  "O-06": ["operator", "/operator/apply/confirm"],
  "O-07": ["operator", "/operator/apply/contract"],
  "O-08": ["operator", "/operator/certificate"],
  "O-09": ["operator", "/operator"],
  "O-10": ["operator", "/operator/milestones"],
  "O-11": ["operator", `/operator/milestones/${M1}/evidence`],
  "O-11E": ["operator", `/operator/milestones/${M1}/appeal`],
  "O-12": ["operator", `/operator/milestones/${M1}/done`],
  "O-13": ["operator", "/operator/settlements"],
  "A-01": ["admin", "/admin"],
  "A-02": ["admin", "/admin/operators"],
  "A-03": ["admin", "/admin/certificates"],
  "A-04": ["admin", "/admin/spaces"],
  "A-06": ["admin", "/admin/projects"],
  "A-07": ["admin", `/admin/projects/${P1}/milestones`],
  "A-08": ["admin", "/admin/evidence"],
  "A-09": ["admin", "/admin/expert-review"],
  "A-10": ["admin", "/admin/settlement-rules"],
  "A-11": ["admin", "/admin/settlements"],
  "A-12": ["admin", "/admin/audit-logs"],
  "A-13": ["admin", "/admin/roles"],
  "A-14": ["admin", "/admin/notifications"],
  "A-15": ["admin", "/admin/aml"],
  "A-16": ["admin", "/admin/ledger"],
};

const CREDS = {
  investor: "investor@farmfi.test",
  operator: "operator@farmfi.test",
  admin: "admin@farmfi.test",
};

/** 공백과 따옴표 차이는 무시하고 글자만 본다. */
const norm = (s) => s.replace(/[\s ]+/g, "").replace(/[’'‘]/g, "");

const browser = await chromium.launch();
const ctxs = {};
for (const [role, email] of Object.entries(CREDS)) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const res = await c.request.post(`${BASE}/api/auth/login`, {
    data: { email, password: "farmfi123" },
  });
  if (!res.ok()) throw new Error(`${role} 로그인 실패 — 시드를 먼저 넣으세요`);
  ctxs[role] = c;
}
ctxs.guest = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

const report = [];
for (const [sid, want] of Object.entries(labels)) {
  const route = ROUTES[sid];
  if (!route) continue;
  const [role, url] = route;
  const page = await ctxs[role].newPage();
  let text = "";
  try {
    await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(600);
    text = norm(await page.evaluate(() => document.body.innerText));
  } catch {
    text = "";
  }
  await page.close();
  const missing = want.filter((w) => !text.includes(norm(w.text)));
  report.push({ sid, path: url, total: want.length, missing: missing.map((m) => m.text) });
}
await browser.close();

fs.writeFileSync(path.join(HERE, "audit.json"), JSON.stringify(report, null, 2));
report.sort((a, b) => b.missing.length - a.missing.length);
for (const r of report) {
  console.log(
    `${r.sid.padEnd(6)} ${String(r.missing.length).padStart(3)}/${String(r.total).padEnd(3)} ${r.path}`,
  );
}
console.log(`\n합계 ${report.reduce((n, r) => n + r.missing.length, 0)} / ${report.reduce((n, r) => n + r.total, 0)}`);
