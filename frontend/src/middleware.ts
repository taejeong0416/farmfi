import { NextResponse, type NextRequest } from "next/server";

/**
 * 없어진 화면으로 들어오는 예전 링크를 지금 화면으로 보낸다.
 * 계좌 확인이 옛 지갑 등록·재연결 화면의 자리를 대신한다.
 */
const REDIRECTS: Record<string, string> = {
  "/wallet": "/verify/account",
  "/wallet/register": "/verify/account",
  "/wallet/reconnect": "/verify/account",
  "/verify-identity": "/verify/mobile-id",
  "/dividends": "/investor/holdings",
  "/portfolio": "/investor/holdings",
};

/**
 * CORS 허용 오리진.
 *
 * `next.config.mjs`의 정적 헤더는 오리진을 하나밖에 못 적는다. 그래서 배포 주소만
 * 열려 있었고 **로컬에서 앱을 띄우면 API 호출이 전부 막혔다** — 앱 개발자가
 * 브라우저로 화면을 확인할 방법이 없었다는 뜻이다.
 *
 * 와일드카드(`*`)는 쓰지 않는다(프로젝트 보안 규칙). 대신 허용 목록에 있을 때만
 * 요청 오리진을 그대로 돌려준다. 개발 환경에서는 localhost를 포트에 상관없이
 * 허용한다 — Expo가 쓰는 포트가 실행마다 달라진다. 프로덕션에서는 열지 않는다.
 */
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "https://pnu-2026-ai-hackathon.github.io")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const IS_DEV = process.env.NODE_ENV !== "production";

function allowOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (IS_DEV && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function withCors(res: NextResponse, origin: string | null): NextResponse {
  const allowed = allowOrigin(origin);
  if (!allowed) return res;
  res.headers.set("Access-Control-Allow-Origin", allowed);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  // 오리진마다 응답이 달라지므로 캐시가 섞이지 않게 알린다.
  res.headers.set("Vary", "Origin");
  return res;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (request.nextUrl.pathname.startsWith("/api/")) {
    // 프리플라이트는 본문 없이 204로 끝낸다.
    if (request.method === "OPTIONS") {
      return withCors(new NextResponse(null, { status: 204 }), origin);
    }
    return withCors(NextResponse.next(), origin);
  }

  const target = REDIRECTS[request.nextUrl.pathname];
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/wallet",
    "/wallet/register",
    "/wallet/reconnect",
    "/verify-identity",
    "/dividends",
    "/portfolio",
  ],
};
