#!/usr/bin/env node
/**
 * OACX 국내 중계.
 *
 * 왜 필요한가 — cx.raonsecure.co.kr:18543은 국내 IP만 통과시킨다. 측정값:
 *   내 노트북(한국 LG U+)  → HTTP 404, 0.066초   ← 도달
 *   Vercel(미국)           → connect timeout 10초  ← 조용히 드롭
 *   Oracle(오사카)         → connect timeout 25초  ← 조용히 드롭
 * 그래서 국내 회선에 있는 이 프로세스가 대신 나가고, 배포본은 터널로 여기를 부른다.
 *
 * 실행:
 *   OACX_RELAY_TOKEN=$(openssl rand -hex 32) node scripts/oacx-relay.mjs
 *   cloudflared tunnel --url http://127.0.0.1:8788
 * 그리고 배포 환경에 OACX_BASE_URL=<터널 URL>, OACX_RELAY_TOKEN=<같은 값>.
 *
 * ⚠️ 이 프로세스는 개인정보(이름·생년월일·CI·전화번호·주소)가 지나간다.
 *    본문은 절대 로그로 남기지 않는다. 경로와 상태코드만 찍는다.
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const UPSTREAM = "https://cx.raonsecure.co.kr:18543";
const PREFIX = "/oacx/api/v1.0/";
const PORT = Number(process.env.OACX_RELAY_PORT ?? 8788);
const TOKEN = process.env.OACX_RELAY_TOKEN ?? "";

if (!TOKEN || TOKEN.length < 32) {
  console.error("OACX_RELAY_TOKEN이 없거나 너무 짧다(32자 이상). 토큰 없이는 열지 않는다.");
  console.error("  OACX_RELAY_TOKEN=$(openssl rand -hex 32) node scripts/oacx-relay.mjs");
  process.exit(1);
}

// 길이가 다르면 timingSafeEqual이 던지므로 길이부터 본다. 길이 노출은 무해하다.
function tokenOk(got) {
  if (typeof got !== "string") return false;
  const a = Buffer.from(got);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error("본문이 너무 큽니다")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  // 터널이 살아있는지 보는 용도. 인증 없이 열되 아무것도 알려주지 않는다.
  if (req.url === "/healthz") return send(200, { ok: true });

  if (!tokenOk(req.headers["x-relay-token"])) {
    // 값은 절대 찍지 않는다. 길이만 남긴다 — 0이면 헤더 자체가 안 온 것이고,
    // 0이 아니면 값이 다른 것이다. 둘은 고치는 방법이 다르다.
    const got = req.headers["x-relay-token"];
    const len = typeof got === "string" ? got.length : 0;
    console.log(`  401 ${req.method} ${String(req.url).slice(0, 60)} — 받은 토큰 ${len}자 / 기대 ${TOKEN.length}자`);
    return send(401, { clientMessage: "중계 토큰이 올바르지 않습니다" });
  }

  // 상위 호스트는 고정이다. 경로도 OACX API 접두사로 제한한다 —
  // 열린 프록시로 쓰이지 않게 한다.
  const path = String(req.url ?? "");
  if (!path.startsWith(PREFIX)) {
    console.log(`  403 ${req.method} ${path.slice(0, 60)}`);
    return send(403, { clientMessage: "허용되지 않은 경로입니다" });
  }

  try {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    const upstream = await fetch(`${UPSTREAM}${path}`, {
      method: req.method,
      headers: { "Content-Type": req.headers["content-type"] ?? "application/json" },
      body: body && body.length ? body : undefined,
    });
    const text = await upstream.text();
    console.log(`  ${upstream.status} ${req.method} ${path.slice(0, 60)}`); // 본문은 찍지 않는다
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    });
    res.end(text);
  } catch (err) {
    console.log(`  502 ${req.method} ${path.slice(0, 60)} — ${err?.message ?? err}`);
    send(502, { clientMessage: "중계가 OACX에 연결하지 못했습니다" });
  }
});

// 공개 노출은 터널이 담당한다. 이 프로세스는 로컬에만 묶는다.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`OACX 중계 → ${UPSTREAM}`);
  console.log(`  http://127.0.0.1:${PORT} (로컬 바인드)`);
  console.log(`  터널: cloudflared tunnel --url http://127.0.0.1:${PORT}`);
});
