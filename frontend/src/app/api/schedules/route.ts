import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 명세 3.2 재배 일정.
// 별도 테이블을 만들지 않는다 — 일정은 Inventory.plantedAt/expectedHarvestAt 이
// 이미 표현하고 있고, 여기에 Schedule 테이블을 겹치면 두 곳이 서로 다른 답을
// 말하게 된다. 상태는 날짜에서 파생한다(저장하지 않는다).

function statusOf(plantedAt: Date | null, harvestAt: Date | null, now: Date): "planned" | "growing" | "done" {
  if (!plantedAt) return "planned";
  if (plantedAt > now) return "planned";
  if (harvestAt && harvestAt <= now) return "done";
  return "growing";
}

// GET /api/schedules?projectId=
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const rows = await prisma.inventory.findMany({
    where: { projectId },
    include: { product: true },
    orderBy: [{ expectedHarvestAt: "asc" }],
  });

  const now = new Date();
  const schedules = rows.map((r, i) => ({
    id: r.id,
    bedIndex: i,
    productId: r.productId,
    productName: r.product.name,
    category: r.product.category,
    sownAt: r.plantedAt?.toISOString() ?? null,
    harvestAt: r.expectedHarvestAt?.toISOString() ?? null,
    growDays: r.product.growDays,
    growing: r.growing,
    status: statusOf(r.plantedAt, r.expectedHarvestAt, now),
  }));

  return NextResponse.json({ projectId, schedules });
}

// PUT /api/schedules  { projectId, productId, sownAt, harvestAt, growing? }
// 일정 등록/수정. 지점+품목 조합이 이미 있으면 날짜를 갱신한다.
export async function PUT(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const projectId = typeof b.projectId === "string" ? b.projectId : "";
  const productId = typeof b.productId === "string" ? b.productId : "";
  const sownRaw = typeof b.sownAt === "string" ? b.sownAt : "";
  const harvestRaw = typeof b.harvestAt === "string" ? b.harvestAt : "";

  if (!projectId || !productId) {
    return NextResponse.json({ error: "projectId, productId가 필요합니다." }, { status: 400 });
  }

  const sownAt = new Date(sownRaw);
  const harvestAt = new Date(harvestRaw);
  if (Number.isNaN(sownAt.getTime())) {
    return NextResponse.json({ error: "파종일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (Number.isNaN(harvestAt.getTime())) {
    return NextResponse.json({ error: "수확 예정일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (harvestAt <= sownAt) {
    return NextResponse.json({ error: "수확 예정일은 파종일 이후여야 합니다." }, { status: 400 });
  }

  const growingRaw = b.growing;
  const growing = growingRaw === undefined ? undefined : Number(growingRaw);
  if (growing !== undefined && (!Number.isInteger(growing) || growing < 0)) {
    return NextResponse.json({ error: "재배 수량은 0 이상 정수여야 합니다." }, { status: 400 });
  }

  const [project, product] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
  if (!product) return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });

  const saved = await prisma.inventory.upsert({
    where: { projectId_productId: { projectId, productId } },
    create: {
      projectId, productId,
      plantedAt: sownAt, expectedHarvestAt: harvestAt,
      inStock: 0, growing: growing ?? 0,
    },
    update: {
      plantedAt: sownAt, expectedHarvestAt: harvestAt,
      ...(growing === undefined ? {} : { growing }),
    },
  });

  return NextResponse.json({
    id: saved.id,
    projectId, productId,
    sownAt: saved.plantedAt?.toISOString() ?? null,
    harvestAt: saved.expectedHarvestAt?.toISOString() ?? null,
  });
}
