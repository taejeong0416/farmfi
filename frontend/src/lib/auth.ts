import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export type Role = "investor" | "operator" | "landlord" | "admin";

export interface SessionPayload {
  userId: string;
  role: Role;
  // 레거시(SIWE) 세션 호환용. 이메일+비밀번호 세션에는 없다.
  walletAddress?: string;
}

const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Never operate with a missing secret — signing/verifying would be insecure.
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session JWT (HS256, 7d expiry) for the given identity.
 * Returns the compact JWT string — caller sets it into the httpOnly `session` cookie.
 */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    role: payload.role,
    ...(payload.walletAddress ? { walletAddress: payload.walletAddress } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/** Cookie options for the session cookie (kept centralized for set/clear parity). */
export function sessionCookieOptions(maxAge: number = MAX_AGE_SECONDS) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

/**
 * Read + verify the `session` cookie. Returns the trusted identity or null.
 * NEVER derive identity from client-sent body/query — always from this JWT.
 */
export async function getServerSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    let token = cookieStore.get(SESSION_COOKIE)?.value;
    // 쿠키가 없으면 Authorization: Bearer 헤더에서 읽는다 (모바일 앱 경로).
    if (!token) {
      const authHeader = (await headers()).get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      }
    }
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub;
    const walletAddress = payload.walletAddress;
    const role = payload.role;

    if (typeof userId !== "string" || typeof role !== "string") {
      return null;
    }

    return {
      userId,
      role: role as Role,
      ...(typeof walletAddress === "string" ? { walletAddress } : {}),
    };
  } catch {
    // Invalid/expired/tampered token → treat as unauthenticated. No error leak.
    return null;
  }
}

/**
 * Assert an authenticated session with the given role (admin always passes).
 * Throws a Response (403/401) that route handlers can rethrow directly.
 */
export async function requireRole(role: Role): Promise<SessionPayload> {
  const session = await getServerSession();
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  if (session.role !== role && session.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return session;
}
