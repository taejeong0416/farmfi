import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { resolveSettlementRule } from "@/lib/waterfall";

// 정산 규칙 (명세 2.1 / 2.1.1) — 플랫폼 운영자가 프로젝트별 수수료율과
// 우선배분·전환 규칙을 설정한다. 규칙 행이 없으면 waterfall.ts 기본값이 적용된다.

type RuleInput = {
  monthlyPlatformFee?: unknown;
  experienceFeeRate?: unknown;
  b2bFeeRate?: unknown;
  deficitInvestorShare?: unknown;
  surplusInvestorShare?: unknown;
  breakEvenRevenue?: unknown;
};

/** 비율 필드는 0~1, 금액 필드는 0 이상 정수. 잘못된 값은 계산을 조용히 망치므로 여기서 막는다. */
function parseRule(body: RuleInput):
  | { ok: true; data: Record<string, number | bigint> }
  | { ok: false; error: string } {
  const data: Record<string, number | bigint> = {};

  const rates: [keyof RuleInput, string][] = [
    ["experienceFeeRate", "체험 중개 수수료율"],
    ["b2bFeeRate", "B2B 성사 수수료율"],
    ["deficitInvestorShare", "적자 구간 투자자 배분율"],
    ["surplusInvestorShare", "흑자 구간 투자자 배분율"],
  ];
  for (const [key, label] of rates) {
    const raw = body[key];
    if (raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      return { ok: false, error: `${label}은 0 이상 1 이하여야 합니다` };
    }
    data[key] = n;
  }

  const amounts: [keyof RuleInput, string][] = [
    ["monthlyPlatformFee", "월 플랫폼 이용료"],
    ["breakEvenRevenue", "흑자 전환 기준 매출"],
  ];
  for (const [key, label] of amounts) {
    const raw = body[key];
    if (raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return { ok: false, error: `${label}은 0 이상 정수여야 합니다` };
    }
    data[key] = BigInt(n);
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "변경할 항목이 없습니다" };
  }
  return { ok: true, data };
}

// GET /api/projects/[id]/settlement-rule — 적용 중인 규칙(기본값 병합 결과)을 돌려준다.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const rule = await resolveSettlementRule(id);
    // 임대료는 규칙이 아니라 파트너 행이 들고 있다 — 화면이 같이 보여줄 수 있게 함께 내려준다.
    const landlord = await prisma.projectPartner.findFirst({
      where: { projectId: id, role: "landlord" },
      select: { name: true, monthlyRecoveryAmount: true },
    });

    return NextResponse.json({
      projectId: id,
      projectName: project.name,
      rule,
      landlordRent: landlord
        ? { name: landlord.name, monthlyRent: Number(landlord.monthlyRecoveryAmount) }
        : null,
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/settlement-rule error:", error);
    return NextResponse.json({ error: "Failed to load settlement rule" }, { status: 500 });
  }
}

// PUT /api/projects/[id]/settlement-rule — 규칙을 만들거나 갱신한다(부분 갱신 허용).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const parsed = parseRule(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const before = await resolveSettlementRule(id);

    await prisma.settlementRule.upsert({
      where: { projectId: id },
      // create에 없는 필드는 스키마 기본값이 채운다 = waterfall.ts 기본값과 같은 수치.
      create: { projectId: id, ...parsed.data, updatedById: session.userId },
      update: { ...parsed.data, updatedById: session.userId },
    });

    const after = await resolveSettlementRule(id);

    const changed = Object.keys(parsed.data);
    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "settlement_rule.updated",
      entityType: "settlement_rule",
      entityId: id,
      projectId: id,
      summary: `${project.name} 정산 규칙 변경 (${changed.join(", ")})`,
      detail: { changed, before: { ...before }, after: { ...after } },
    });

    return NextResponse.json({ projectId: id, rule: after });
  } catch (error) {
    console.error("PUT /api/projects/[id]/settlement-rule error:", error);
    return NextResponse.json({ error: "Failed to save settlement rule" }, { status: 500 });
  }
}
