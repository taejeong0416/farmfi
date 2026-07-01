import { NextResponse } from "next/server";

const NONCE_COOKIE = "siwe-nonce";

export async function GET() {
  // SIWE nonce must be alphanumeric and >= 8 chars. UUID (hex+dashes) → strip dashes.
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const response = NextResponse.json({ nonce });
  response.cookies.set({
    name: NONCE_COOKIE,
    value: nonce,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes to complete sign-in
  });
  return response;
}
