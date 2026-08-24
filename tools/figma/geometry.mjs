// 도면 좌표 ↔ 실제 렌더 좌표 대조. `npm run dev`를 띄운 상태에서:
//
//     python tools/figma/geometry.py
//     node tools/figma/geometry.mjs
//
// `audit.mjs`가 "문구가 있는가"를 세는 것과 달리 여기서는 "어디에, 얼마나 크게"를 본다.
// 화면 프레임 왼쪽 위를 원점으로 한 도면 좌표와, 문서 좌표계의 요소 위치를 맞춰본다.
//
// 판정은 **중앙값**으로 한다. 데이터가 길어지면 아래가 통째로 밀리므로 개별 어긋남보다
// 화면 전체가 어느 쪽으로 얼마나 밀렸는지가 먼저다. 세로는 데이터 양에 따라 얼마든지
// 달라지므로 가로(x)와 글자 크기를 더 무겁게 읽는다.

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, "..", "..", "frontend", "package.json"));
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const geometry = JSON.parse(fs.readFileSync(path.join(HERE, "geometry.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(HERE, "audit-ids.json"), "utf8"));
const { P1, P3, M1, PICKUP, SPACE } = ids;

/** audit.mjs와 같은 경로표. 한쪽만 고치면 두 대조가 다른 화면을 본다. */
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
  "I-05": ["investor", "/investor/applications"],
  "I-06": ["investor", "/investor"],
  "I-07": ["investor", "/investor/holdings"],
  "I-09": ["investor", "/investor/notifications"],
  "I-10": ["investor", "/investor/notifications/settings"],
  "B-01": ["investor", "/subscribe"],
  "B-02": ["investor", "/subscribe/plan"],
  "B-04": ["investor", "/subscribe/order"],
  "B-06": ["investor", "/subscribe/done"],
  "B-07": ["investor", "/subscriptions"],
  "B-08": ["investor", "/subscriptions/change"],
  "B-09": ["investor", `/subscriptions/pickup/${PICKUP}`],
  "O-01": ["operator", "/operator/spaces"],
  "O-02": ["operator", `/operator/spaces/${SPACE}`],
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

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

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
for (const [sid, spec] of Object.entries(geometry)) {
  const route = ROUTES[sid];
  if (!route) continue;
  const [role, url] = route;
  // dev 서버는 첫 방문에 라우트를 컴파일한다. 한 번에 안 열리면 다시 연다 —
  // 여기서 비어 나오면 "화면이 다르다"가 아니라 "안 열렸다"인데 둘이 구분되지 않는다.
  let found = [];
  for (let attempt = 0; attempt < 2 && found.length === 0; attempt += 1) {
  const page = await ctxs[role].newPage();
  try {
    await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(attempt === 0 ? 700 : 2500);
    found = await page.evaluate((nodes) => {
      const norm = (s) => (s ?? "").replace(/[\s ]+/g, "").replace(/[’'‘]/g, "");
      // 잎 노드만 본다. 부모 컨테이너는 자식 글자를 다 품어 상자가 훨씬 크다.
      // `option`은 화면에 그려지는 상자가 없어 좌표가 0으로 나온다 — 빼지 않으면
      // 드롭다운이 있는 화면마다 수백 px씩 어긋난 것처럼 보인다.
      const SKIP = new Set(["OPTION", "SCRIPT", "STYLE", "TITLE", "NOSCRIPT"]);
      const leaves = [...document.querySelectorAll("body *")].filter((el) => {
        if (el.children.length > 0 || SKIP.has(el.tagName)) return false;
        if (norm(el.textContent).length === 0) return false;
        const r = el.getBoundingClientRect();
        // 크기가 0이면 감춰졌거나 그려지지 않은 것이다.
        return r.width > 0 && r.height > 0;
      });
      const byText = new Map();
      for (const el of leaves) {
        const k = norm(el.textContent);
        if (!byText.has(k)) byText.set(k, []);
        byText.get(k).push(el);
      }
      const out = [];
      for (const n of nodes) {
        const cands = byText.get(norm(n.text));
        if (!cands || cands.length === 0) continue;
        // 여러 개면 도면이 가리키는 자리에 가장 가까운 것을 고른다.
        let best = null;
        for (const el of cands) {
          const r = el.getBoundingClientRect();
          const x = r.left + window.scrollX;
          const y = r.top + window.scrollY;
          const d = Math.abs(x - n.x) + Math.abs(y - n.y);
          if (!best || d < best.d) {
            best = { d, x, y, size: parseFloat(getComputedStyle(el).fontSize) };
          }
        }
        out.push({
          text: n.text,
          dx: Math.round(best.x - n.x),
          dy: Math.round(best.y - n.y),
          size: Math.round(best.size),
          wantSize: n.size,
        });
      }
      return out;
    }, spec.nodes);
  } catch {
    found = [];
  }
  await page.close();
  }

  const dxs = found.map((f) => f.dx);
  const dys = found.map((f) => f.dy);
  const mx = median(dxs);
  const my = median(dys);
  // 화면 전체가 밀린 몫을 뺀 나머지가 진짜 어긋남이다.
  const offX = found.filter((f) => Math.abs(f.dx - (mx ?? 0)) > 8);
  const offY = found.filter((f) => Math.abs(f.dy - (my ?? 0)) > 24);
  const badSize = found.filter((f) => f.size !== f.wantSize);

  report.push({
    sid,
    path: url,
    matched: found.length,
    total: spec.nodes.length,
    shiftX: mx,
    shiftY: my,
    offX: offX.map((f) => `${f.text} (x${f.dx > 0 ? "+" : ""}${f.dx - (mx ?? 0)})`),
    offY: offY.map((f) => `${f.text} (y${f.dy - (my ?? 0) > 0 ? "+" : ""}${f.dy - (my ?? 0)})`),
    badSize: badSize.map((f) => `${f.text} ${f.size}px → ${f.wantSize}px`),
  });
}
await browser.close();

fs.writeFileSync(path.join(HERE, "geometry-report.json"), JSON.stringify(report, null, 2));

console.log("화면    맞춘문구  가로밀림  세로밀림  가로어긋남  세로어긋남  글자크기");
const sorted = [...report].sort(
  (a, b) => b.offX.length + b.badSize.length - (a.offX.length + a.badSize.length),
);
for (const r of sorted) {
  console.log(
    [
      r.sid.padEnd(6),
      `${r.matched}/${r.total}`.padStart(8),
      String(r.shiftX ?? "-").padStart(8),
      String(r.shiftY ?? "-").padStart(8),
      String(r.offX.length).padStart(10),
      String(r.offY.length).padStart(10),
      String(r.badSize.length).padStart(8),
    ].join(" "),
  );
}
const sum = (k) => report.reduce((n, r) => n + r[k].length, 0);
console.log(
  `\n합계 — 가로 어긋남 ${sum("offX")} · 세로 어긋남 ${sum("offY")} · 글자 크기 ${sum("badSize")}` +
    ` (맞춘 문구 ${report.reduce((n, r) => n + r.matched, 0)})`,
);
