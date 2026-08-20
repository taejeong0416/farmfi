import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";

/** YYYY-MM 형식인지. 아니면 정산 기간을 특정할 수 없다. */
function isPeriod(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type CostLine = { label: string; amount: number };

function parseCosts(input: unknown): CostLine[] | null {
  if (!Array.isArray(input)) return null;
  const out: CostLine[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const { label, amount } = raw as { label?: unknown; amount?: unknown };
    if (typeof label !== "string" || !label.trim()) return null;
    const n = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(n) || n < 0) return null;
    out.push({ label: label.trim(), amount: Math.floor(n) });
  }
  return out;
}

// GET /api/admin/projects/[id]/records?period=YYYY-MM — 기간 입력값 조회 (A-16).
// 저장된 것이 없으면 판매 기록 합계를 매출 초안으로 얹어 돌려준다.
export async function GET(
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
  const period = request.nextUrl.searchParams.get("period") ?? currentPeriod();
  if (!isPeriod(period)) {
    return NextResponse.json({ error: "period는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }

  const record = await prisma.periodRecord.findUnique({
    where: { projectId_period: { projectId: id, period } },
  });

  // 매출 초안 — 그 달의 판매 기록 합계. 담당자가 보고 고쳐서 확정한다.
  const [y, m] = period.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const agg = await prisma.salesRecord.aggregate({
    _sum: { amount: true },
    where: { projectId: id, soldAt: { gte: from, lt: to } },
  });

  return NextResponse.json(
    serializeBigInt({
      period,
      record,
      salesTotal: agg._sum.amount ?? 0,
      editable: record?.status !== "confirmed",
    }),
  );
}

// PUT /api/admin/projects/[id]/records — 초안 저장. 확정된 기간은 잠근다.
export async function PUT(
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
  const { period, revenue, costs } = (body ?? {}) as Record<string, unknown>;

  if (!isPeriod(period)) {
    return NextResponse.json({ error: "period는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }
  const revenueNum = typeof revenue === "number" ? revenue : Number(revenue);
  if (!Number.isFinite(revenueNum) || revenueNum < 0) {
    return NextResponse.json({ error: "매출은 0 이상의 숫자여야 합니다." }, { status: 400 });
  }
  const lines = parseCosts(costs);
  if (!lines) {
    return NextResponse.json(
      { error: "비용 항목은 이름과 0 이상의 금액이 있어야 합니다." },
      { status: 400 },
    );
  }

  const existing = await prisma.periodRecord.findUnique({
    where: { projectId_period: { projectId: id, period } },
  });
  // 확정된 기간을 조용히 덮어쓰면 정산 근거가 바뀐다. 되돌리려면 확정을 푸는
  // 별도 행위가 있어야 하고, 그건 이 API의 일이 아니다.
  if (existing?.status === "confirmed") {
    return NextResponse.json(
      { error: "확정된 기간입니다. 수정하려면 확정을 먼저 해제해야 합니다." },
      { status: 409 },
    );
  }

  const totalCost = lines.reduce((sum, c) => sum + c.amount, 0);
  const record = await prisma.periodRecord.upsert({
    where: { projectId_period: { projectId: id, period } },
    create: {
      projectId: id,
      period,
      revenue: BigInt(Math.floor(revenueNum)),
      costs: lines,
      totalCost: BigInt(totalCost),
    },
    update: {
      revenue: BigInt(Math.floor(revenueNum)),
      costs: lines,
      totalCost: BigInt(totalCost),
    },
  });

  return NextResponse.json(serializeBigInt({ record }));
}
