import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const ROLES = ["investor", "landlord", "operator", "admin"] as const;

// GET /api/admin/users — 권한 관리 목록 (A-13).
export async function GET() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      identityVerified: true,
      verifiedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ users, roles: ROLES });
}

// PATCH /api/admin/users — 역할 변경. 자기 자신의 admin 권한은 내려놓지 못한다.
export async function PATCH(request: NextRequest) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { id, role } = (body ?? {}) as { id?: unknown; role?: unknown };

  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "사용자 id가 필요합니다." }, { status: 400 });
  }
  if (typeof role !== "string" || !ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json(
      { error: `role은 ${ROLES.join(", ")} 중 하나여야 합니다.` },
      { status: 400 },
    );
  }
  if (id === session.userId && role !== "admin") {
    return NextResponse.json(
      { error: "자기 계정의 관리자 권한은 내려놓을 수 없습니다." },
      { status: 400 },
    );
  }

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action: "user.role_changed",
    entityType: "user",
    entityId: id,
    summary: `${user.name} 역할 변경 ${before.role} → ${role}`,
    detail: { before: before.role, after: role },
  });

  return NextResponse.json({ user });
}
