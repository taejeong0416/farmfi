import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // set/clear 옵션 정합은 auth.ts의 sessionCookieOptions가 중앙 관리한다.
  response.cookies.set({ ...sessionCookieOptions(0), value: "" });
  return response;
}
