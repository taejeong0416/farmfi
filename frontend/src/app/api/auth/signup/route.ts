import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signSession, sessionCookieOptions, type Role } from "@/lib/auth";

// 회원가입에서 자가배정 가능한 역할. admin은 시드/운영 전용이라 여기서 못 고른다.
const SIGNUP_ROLES = ["landlord", "operator", "investor"] as const;

/**
 * 이메일+비밀번호 회원가입. 이메일 중복 확인 → bcrypt 해시 저장 → 세션(JWT) 발급.
 * 세션 식별자는 userId + role뿐이며, 비밀번호 원문은 저장하지 않는다.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, email, password, role } = (body ?? {}) as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
  };

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "비밀번호는 8자 이상이어야 합니다." },
      { status: 400 }
    );
  }
  if (
    typeof role !== "string" ||
    !SIGNUP_ROLES.includes(role as (typeof SIGNUP_ROLES)[number])
  ) {
    return NextResponse.json({ error: "역할을 선택해주세요." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return NextResponse.json(
      { error: "이미 가입된 이메일입니다." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, passwordHash, role },
    });
  } catch (e) {
    // 선조회~생성 사이 동시 가입 레이스: unique(email) 위반은 중복 가입으로 응답.
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "이미 가입된 이메일입니다." },
        { status: 409 }
      );
    }
    throw e;
  }

  const token = await signSession({ userId: user.id, role: user.role as Role });

  const response = NextResponse.json({
    // token: 모바일 앱(RN)이 저장해 Bearer로 보내기 위한 값 (웹은 쿠키 사용).
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  response.cookies.set({ ...sessionCookieOptions(), value: token });
  return response;
}
