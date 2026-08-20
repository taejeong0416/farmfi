import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { getServerSession, requireRole } from "@/lib/auth";

// GET /api/milestones/[id] — 단계 한 건.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, location: true } } },
  });
  if (!milestone) {
    return NextResponse.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ milestone: serializeBigInt(milestone) });
}

/**
 * PATCH /api/milestones/[id] — 마일스톤 설정 (A-07). 관리자 전용.
 * 집행이 끝난 단계는 금액·조건을 바꾸지 않는다 — 이미 나간 돈의 근거이기 때문이다.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) {
    return NextResponse.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
  }
  if (milestone.status === "completed") {
    return NextResponse.json(
      { error: "집행이 끝난 단계는 수정할 수 없습니다." },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.conditionText === "string") data.conditionText = b.conditionText;
  if (b.releaseAmount !== undefined) {
    const amount = Number(b.releaseAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: "집행 금액을 확인해 주세요." },
        { status: 400 },
      );
    }
    data.releaseAmount = BigInt(Math.floor(amount));
  }
  if (Array.isArray(b.requiredSignals)) {
    data.requiredSignals = b.requiredSignals.filter(
      (s): s is string => typeof s === "string",
    );
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "바꿀 내용이 없습니다." }, { status: 400 });
  }

  const updated = await prisma.milestone.update({ where: { id }, data });
  return NextResponse.json({ milestone: serializeBigInt(updated) });
}
