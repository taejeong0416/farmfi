import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signSession, sessionCookieOptions, type Role } from "@/lib/auth";

/**
 * 이메일+비밀번호 로그인. 이메일로 사용자 조회 → bcrypt 비교 → 세션(JWT) 발급.
 * 실패 사유(이메일 없음/비번 불일치)를 구분해 노출하지 않는다(계정 열거 방지).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  const ok =
    user?.passwordHash != null &&
    (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) {
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const token = await signSession({ userId: user.id, role: user.role as Role });

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  response.cookies.set({ ...sessionCookieOptions(), value: token });
  return response;
}
