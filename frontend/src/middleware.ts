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

export function middleware(request: NextRequest) {
  const target = REDIRECTS[request.nextUrl.pathname];
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/wallet",
    "/wallet/register",
    "/wallet/reconnect",
    "/verify-identity",
    "/dividends",
    "/portfolio",
  ],
};
