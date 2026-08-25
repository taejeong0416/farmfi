/**
 * 배포본 QA 라운드 — 읽기 전용 TC 26건 (docs/qa/web-qa-sheet.xlsx 의 TC-X·TC-Y·TC-Z01·TC-W02).
 *
 *   node scripts/qa-prod-round.mjs            # https://farmfi.co.kr
 *   QA_BASE=http://localhost:3000 node ...    # 로컬 dev
 *
 * 시드 계정으로 로그인만 하고 아무것도 쓰지 않는다. DB에 쓰는 TC(X14~X20·Y09·Y10)는
 * 픽스처 준비와 사후 대조에 DB 접근이 필요해서 여기 없다 — 시트의 수행 방식 참고.
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "https://farmfi.co.kr";
const PW = "farmfi123";
const results = [];

function record(code, expected, actual, pass, note = "") {
  results.push({ code, expected, actual, verdict: pass ? "Pass" : "Fail", note });
  console.log(`${pass ? "PASS" : "FAIL"} ${code} | 기대 ${expected} | 관측 ${actual}${note ? " | " + note : ""}`);
}

async function apiLogin(email) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const data = await res.json();
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
  return { cookie: cookies.join("; "), user: data.user };
}

async function apiGet(path, cookie) {
  const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: res.status, text: (await res.text()).slice(0, 200) };
}

async function browserLogin(context, email) {
  const page = await context.newPage();
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.close();
}

async function landedPath(context, path) {
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const url = new URL(page.url());
  const out = url.pathname + url.search;
  await page.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();

  // ── 사전: 프로젝트 id
  const projects = await (await fetch(BASE + "/api/projects")).json();
  const list = Array.isArray(projects) ? projects : projects.projects ?? [];
  const P = list[0].id;
  const FUNDING = (list.find((p) => p.status === "funding") ?? list[0]).id;
  console.log("project:", P, "funding:", FUNDING);

  const admin = await apiLogin("admin@farmfi.test");
  const operator = await apiLogin("operator@farmfi.test");
  const investor = await apiLogin("investor@farmfi.test");
  const demo = await apiLogin("demo@farmfi.test");
  const me = await apiGet("/api/auth/me", demo.cookie);
  console.log("demo /api/auth/me:", me.status, me.text);

  // ── API 권한 TC
  let r = await apiGet(`/api/optimization/${P}`, null);
  record("TC-X01", "401", String(r.status), r.status === 401);

  r = await apiGet(`/api/briefing/${P}`, null);
  record("TC-X02", "401", String(r.status), r.status === 401);

  r = await apiGet(`/api/optimization/${P}`, investor.cookie);
  record("TC-X03", "403", String(r.status), r.status === 403);

  r = await apiGet(`/api/optimization/${P}`, operator.cookie);
  record("TC-X04", "200", String(r.status), r.status === 200);

  const sub = await fetch(BASE + "/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: investor.cookie },
    body: JSON.stringify({ projectId: P, amount: 100000 }),
  });
  record("TC-X13", "404", String(sub.status), sub.status === 404);

  // ── 화면 가드 TC
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let got = await landedPath(anon, `/optimization/${P}`);
  record("TC-X05", "/login 으로 이동", got, got.startsWith("/login"));

  const inv = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await browserLogin(inv, "investor@farmfi.test");
  got = await landedPath(inv, `/optimization/${P}`);
  record("TC-X06", "/investor", got, got === "/investor");
  got = await landedPath(inv, "/admin");
  record("TC-X07", "/investor", got, got === "/investor");
  got = await landedPath(inv, "/admin/ledger");
  record("TC-X08", "/investor", got, got === "/investor");
  got = await landedPath(inv, "/operator/milestones");
  record("TC-X09", "/investor", got, got === "/investor");
  got = await landedPath(inv, "/landlord");
  record("TC-X10", "/investor", got, got === "/investor");

  const adm = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await browserLogin(adm, "admin@farmfi.test");
  got = await landedPath(adm, "/admin");
  record("TC-X11", "/admin 그대로", got, got === "/admin");

  const opr = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await browserLogin(opr, "operator@farmfi.test");
  got = await landedPath(opr, "/operator/milestones");
  record("TC-X12", "/operator/milestones 그대로", got, got === "/operator/milestones");

  // ── TC-X21 내 구독 죽은 링크
  {
    const page = await inv.newPage();
    const bad = [];
    page.on("response", (res) => {
      if (res.status() === 404) bad.push(`${res.status()} ${new URL(res.url()).pathname}`);
    });
    await page.goto(BASE + "/subscriptions", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    const payouts = hrefs.filter((h) => h && h.startsWith("/investor/payouts"));
    record(
      "TC-X21",
      "/investor/payouts 링크 없음 · 404 없음",
      `링크 ${payouts.length}건 · 404 ${bad.length}건`,
      payouts.length === 0 && bad.length === 0,
      bad.join(", "),
    );
    await page.close();
  }

  // ── TC-X22/X23 가로 넘침
  const SCREENS = ["/", "/projects", "/subscribe", "/about", "/start"];
  for (const [code, w, h] of [["TC-X22", 390, 844], ["TC-X23", 768, 1024]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const over = [];
    for (const s of SCREENS) {
      const page = await ctx.newPage();
      await page.goto(BASE + s, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const docW = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      if (docW > w + 1) over.push(`${s} ${docW}px`);
      await page.close();
    }
    await ctx.close();
    record(code, "넘침 없음", over.length ? over.join(", ") : `5화면 모두 ${w}px 이내`, over.length === 0);
  }

  // ── TC-Y01 배지
  {
    const page = await anon.newPage();
    await page.goto(BASE + "/projects", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const body = await page.evaluate(() => document.body.innerText);
    const hasBad = body.includes("비보장");
    const hasGoal = /목표\s*[\d.]+\s*%/.test(body);
    record("TC-Y01", "'비보장' 없음 · '목표 N%' 유지", `비보장 ${hasBad ? "검출" : "미검출"} · 목표배지 ${hasGoal ? "유지" : "없음"}`, !hasBad && hasGoal);
    await page.close();
  }

  // ── TC-Y02 비회원 홈 잠금
  {
    const page = await anon.newPage();
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const overlay = await page.locator("text=로그인하고 프로젝트를 확인하세요").count();
    const loginBtn = await page.locator('a[href^="/login"]:has-text("로그인")').count();
    const before = page.url();
    const card = page.locator('a[href^="/projects/"]').first();
    let moved = false;
    if (await card.count()) {
      await card.click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1500);
      moved = page.url() !== before;
    }
    record("TC-Y02", "오버레이 + 로그인 버튼 · 카드 클릭해도 이동 없음",
      `오버레이 ${overlay}건 · 로그인버튼 ${loginBtn}건 · 이동 ${moved ? "있음" : "없음"}`,
      overlay > 0 && loginBtn > 0 && !moved);
    await page.close();
  }

  // ── TC-Y03 로그인 후 잠금 해제
  {
    const page = await inv.newPage();
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const overlay = await page.locator("text=로그인하고 프로젝트를 확인하세요").count();
    const card = page.locator('a[href^="/projects/"]').first();
    let dest = "(카드 없음)";
    if (await card.count()) {
      await card.click();
      await page.waitForTimeout(2000);
      dest = new URL(page.url()).pathname;
    }
    record("TC-Y03", "오버레이 없음 · 카드로 상세 이동", `오버레이 ${overlay}건 · ${dest}`,
      overlay === 0 && /^\/projects\/[^/]+$/.test(dest));
    await page.close();
  }

  // ── TC-Y04 배분 현황 카드
  {
    const page = await inv.newPage();
    await page.goto(`${BASE}/projects/${FUNDING}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const body = await page.evaluate(() => document.body.innerText);
    const NEW = ["투자 배분 현황", "내 배분 비율", "총 배정 토큰", "내 보유 토큰"];
    const OLD = ["지점 기준가", "1구좌 기준가", "발행가 대비", "직전 대비"];
    const missing = NEW.filter((t) => !body.includes(t));
    const left = OLD.filter((t) => body.includes(t));
    record("TC-Y04", "새 문구 4개 노출 · 옛 문구 4개 제거",
      `누락 ${missing.join(",") || "없음"} · 잔존 ${left.join(",") || "없음"}`,
      missing.length === 0 && left.length === 0);
    await page.close();
  }

  // ── TC-Y05~Y08 미인증 계정 흐름
  const dem = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await browserLogin(dem, "demo@farmfi.test");
  {
    const page = await dem.newPage();
    await page.goto(`${BASE}/projects/${FUNDING}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const btn = page.locator("button", { hasText: "신청하기" }).last();
    const label = (await btn.count()) ? (await btn.innerText()).trim() : "(버튼 없음)";
    record("TC-Y05", "'본인확인하고 신청하기'", label, label.includes("본인확인하고 신청하기"));

    // 금액 입력 후 신청 → /verify
    const amountInput = page.locator('input[inputmode="numeric"], input[type="number"], input[type="text"]').first();
    if (await amountInput.count()) {
      await amountInput.fill("100000").catch(() => {});
      await page.waitForTimeout(300);
    }
    let dest = "(이동 없음)";
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(2500);
      const u = new URL(page.url());
      dest = u.pathname + u.search;
    }
    record("TC-Y06", "/verify?next=…amount=100000", decodeURIComponent(dest),
      dest.startsWith("/verify") && decodeURIComponent(dest).includes("amount=100000"));

    // 방법 선택 → 신분증
    let dest2 = dest;
    if (dest.startsWith("/verify")) {
      const idBtn = page.locator('a:has-text("모바일 신분증으로 계속"), button:has-text("모바일 신분증으로 계속")').first();
      if (await idBtn.count()) {
        await idBtn.click().catch(() => {});
        await page.waitForTimeout(3000);
        const u = new URL(page.url());
        dest2 = u.pathname + u.search;
      }
    }
    record("TC-Y07", "/verify/mobile-id?next=…amount=100000", decodeURIComponent(dest2),
      dest2.startsWith("/verify/mobile-id") && decodeURIComponent(dest2).includes("amount=100000"));

    // TC-Z01 — 프로덕션에서만 확인되는 구간: 모바일 신분증 QR 발급
    if (dest2.startsWith("/verify/mobile-id")) {
      const calls = [];
      page.on("response", (res) => {
        const p = new URL(res.url()).pathname;
        if (p.startsWith("/api/identity")) calls.push(`${p} ${res.status()}`);
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(6000);
      const qr = await page.locator('img[alt="본인확인 QR"]').count();
      const err = await page.locator("text=QR을 발급하지 못했어요").count();
      record("TC-Z01", "QR 이미지 노출 · 발급 실패 문구 없음",
        `QR ${qr}건 · 실패문구 ${err}건`, qr > 0 && err === 0, calls.join(" / "));
    } else {
      record("TC-Z01", "QR 이미지 노출", "미실행 (mobile-id 진입 실패)", false);
    }
    await page.close();
  }
  {
    const page = await dem.newPage();
    await page.goto(BASE + "/verify/account", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const demoBtn = await page.locator("text=시연 넘어가기").count();
    record("TC-Y08", "'시연 넘어가기' 버튼 존재", `${demoBtn}건`, demoBtn > 0);
    await page.close();
  }

  // ── 금칙어 재검사 (공통 크로스: 2차 '확인 필요')
  {
    const BAN = /STO|토큰증권|지갑\s*주소|0x[0-9a-fA-F]{8}|수익\s*보장|원금\s*보장|확정\s*수익/;
    const ALLOW = ["총 배정 토큰", "내 보유 토큰"];
    const pages = ["/", "/about", "/projects", `/projects/${FUNDING}`, "/subscribe", "/start", "/space", "/investor", "/investor/holdings", "/subscriptions"];
    const hits = [];
    for (const p of pages) {
      const page = await inv.newPage();
      await page.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(700);
      let body = await page.evaluate(() => document.body.innerText).catch(() => "");
      for (const a of ALLOW) body = body.split(a).join("");
      const m = body.match(BAN);
      if (m) hits.push(`${p}: ${m[0]}`);
      await page.close();
    }
    record("TC-W02", "금칙어 0건", hits.length ? hits.join(" / ") : "0건", hits.length === 0);
  }

  await browser.close();
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 1));
  const fail = results.filter((r) => r.verdict === "Fail");
  console.log(`총 ${results.length}건 · Pass ${results.length - fail.length} · Fail ${fail.length}`);
})();
