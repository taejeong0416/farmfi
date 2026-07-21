import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function GET(request: NextRequest) {
  try {
    const projects = await prisma.project.findMany({
      include: {
        escrow: true,
        milestones: true,
        _count: { select: { tokenHoldings: true } },
      },
    });

    const result = projects.map((p) => {
      const fundingPercent =
        Number(p.targetAmount) === 0
          ? 0
          : (Number(p.currentAmount) / Number(p.targetAmount)) * 100;

      return {
        ...p,
        fundingPercent,
        investorCount: p._count.tokenHoldings,
      };
    });

    return NextResponse.json({ projects: serializeBigInt(result) });
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// ─── POST /api/projects — 공모 개설 (운영자/관리자 전용) ───
// Project + Escrow(1) + Milestone(4)를 한 트랜잭션으로 생성한다.
// 마일스톤 releasePct는 요청 시 사람이 읽는 퍼센트(예: 35)로 받아,
// schema 관례("3500 = 35%")에 맞춰 *100으로 저장한다.

const SIGNAL_CODES = ["contract", "receipt", "photo", "iot"] as const;
type SignalCode = (typeof SIGNAL_CODES)[number];

function isSignalCode(v: unknown): v is SignalCode {
  return typeof v === "string" && (SIGNAL_CODES as readonly string[]).includes(v);
}

type ValidatedMilestone = {
  seq: number;
  name: string;
  description: string | null;
  releasePct: number; // percent, 1~100
  conditionText: string | null;
  requiredSignals: SignalCode[];
  iotMinDays: number;
};

function validateMilestones(
  input: unknown
): { ok: true; milestones: ValidatedMilestone[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length !== 4) {
    return { ok: false, error: "마일스톤은 정확히 4단계로 입력해야 합니다." };
  }

  const milestones: ValidatedMilestone[] = [];
  let pctSum = 0;

  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as Record<string, unknown> | null;
    const expectedSeq = i + 1;

    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof raw.name !== "string" ||
      raw.name.trim().length === 0 ||
      typeof raw.releasePct !== "number" ||
      !Number.isFinite(raw.releasePct)
    ) {
      return { ok: false, error: `마일스톤 ${expectedSeq}단계 입력이 올바르지 않습니다.` };
    }

    const seq = typeof raw.seq === "number" ? raw.seq : expectedSeq;
    if (seq !== expectedSeq) {
      return { ok: false, error: "마일스톤 순서(seq)는 1~4 순서대로 입력해야 합니다." };
    }

    const releasePct = raw.releasePct;
    if (releasePct <= 0 || releasePct > 100) {
      return {
        ok: false,
        error: `마일스톤 ${expectedSeq}단계 집행비율은 1~100 사이여야 합니다.`,
      };
    }

    const requiredSignals: SignalCode[] = Array.isArray(raw.requiredSignals)
      ? raw.requiredSignals.filter(isSignalCode)
      : [];
    if (requiredSignals.length === 0) {
      return {
        ok: false,
        error: `마일스톤 ${expectedSeq}단계는 검증 신호를 1개 이상 선택해야 합니다.`,
      };
    }

    const iotMinDaysRaw = raw.iotMinDays;
    const iotMinDays =
      typeof iotMinDaysRaw === "number" && iotMinDaysRaw > 0
        ? Math.floor(iotMinDaysRaw)
        : 0;
    if (requiredSignals.includes("iot") && iotMinDays <= 0) {
      return {
        ok: false,
        error: `마일스톤 ${expectedSeq}단계는 IoT 최소 가동일수를 입력해야 합니다.`,
      };
    }

    milestones.push({
      seq: expectedSeq,
      name: raw.name.trim(),
      description:
        typeof raw.description === "string" ? raw.description.trim() || null : null,
      releasePct,
      conditionText:
        typeof raw.conditionText === "string" ? raw.conditionText.trim() || null : null,
      requiredSignals,
      iotMinDays,
    });
    pctSum += releasePct;
  }

  if (Math.round(pctSum) !== 100) {
    return {
      ok: false,
      error: `마일스톤 집행비율 합계는 100%여야 합니다 (현재 ${pctSum}%).`,
    };
  }

  return { ok: true, milestones };
}

export async function POST(request: NextRequest) {
  // operator/admin만 개설 가능. role은 항상 세션(JWT)에서 가져오며 클라이언트가
  // 보낸 값은 절대 신뢰하지 않는다.
  try {
    await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const body = await request.json();
    const {
      name,
      description,
      location,
      buildingType,
      areaSqm,
      tokenSymbol,
      tokenPrice,
      totalTokens,
      targetAmount,
      milestones,
    } = body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "프로젝트명을 입력해주세요." }, { status: 400 });
    }
    if (typeof tokenSymbol !== "string" || tokenSymbol.trim().length === 0) {
      return NextResponse.json({ error: "토큰 심볼을 입력해주세요." }, { status: 400 });
    }
    if (
      typeof tokenPrice !== "number" ||
      !Number.isFinite(tokenPrice) ||
      tokenPrice <= 0
    ) {
      return NextResponse.json(
        { error: "토큰 가격은 0보다 큰 숫자여야 합니다." },
        { status: 400 }
      );
    }
    if (
      typeof totalTokens !== "number" ||
      !Number.isInteger(totalTokens) ||
      totalTokens <= 0
    ) {
      return NextResponse.json(
        { error: "총 토큰 수는 0보다 큰 정수여야 합니다." },
        { status: 400 }
      );
    }
    if (
      typeof targetAmount !== "number" ||
      !Number.isFinite(targetAmount) ||
      targetAmount <= 0
    ) {
      return NextResponse.json(
        { error: "모집 목표 금액은 0보다 큰 숫자여야 합니다." },
        { status: 400 }
      );
    }
    if (
      areaSqm !== undefined &&
      areaSqm !== null &&
      (typeof areaSqm !== "number" || areaSqm <= 0)
    ) {
      return NextResponse.json(
        { error: "면적은 0보다 큰 숫자여야 합니다." },
        { status: 400 }
      );
    }

    const maxRaise = tokenPrice * totalTokens;
    if (targetAmount > maxRaise) {
      return NextResponse.json(
        {
          error: `모집 목표(${targetAmount.toLocaleString()}원)가 최대 조달 가능액(토큰가격×총토큰수 = ${maxRaise.toLocaleString()}원)을 초과할 수 없습니다.`,
        },
        { status: 400 }
      );
    }

    const milestoneResult = validateMilestones(milestones);
    if (!milestoneResult.ok) {
      return NextResponse.json({ error: milestoneResult.error }, { status: 400 });
    }

    const normalizedSymbol = tokenSymbol.trim().toUpperCase().slice(0, 15);

    const createdId = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: name.trim(),
          description: typeof description === "string" ? description.trim() || null : null,
          location: typeof location === "string" ? location.trim() || null : null,
          buildingType:
            typeof buildingType === "string" ? buildingType.trim() || null : null,
          areaSqm: typeof areaSqm === "number" ? areaSqm : null,
          tokenSymbol: normalizedSymbol,
          tokenPrice: BigInt(Math.round(tokenPrice)),
          totalTokens,
          soldTokens: 0,
          targetAmount: BigInt(Math.round(targetAmount)),
          currentAmount: BigInt(0),
          // CAPEX 별도 입력 필드는 없음 — 모집 목표를 CAPEX로 사용 (seed.ts와 동일 관례).
          totalCapex: BigInt(Math.round(targetAmount)),
          status: "funding",
          fundingStart: new Date(),
          fundingEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.escrow.create({
        data: {
          projectId: project.id,
          totalLocked: BigInt(0),
          totalReleased: BigInt(0),
          remaining: BigInt(0),
          status: "active",
        },
      });

      await tx.milestone.createMany({
        data: milestoneResult.milestones.map((m) => ({
          projectId: project.id,
          seq: m.seq,
          name: m.name,
          description: m.description,
          releasePct: Math.round(m.releasePct * 100),
          releaseAmount: BigInt(Math.round((targetAmount * m.releasePct) / 100)),
          status: "pending",
          conditionText: m.conditionText,
          requiredSignals: m.requiredSignals,
          iotMinDays: m.iotMinDays,
        })),
      });

      return project.id;
    });

    const created = await prisma.project.findUnique({
      where: { id: createdId },
      include: { escrow: true, milestones: { orderBy: { seq: "asc" } } },
    });

    return NextResponse.json({ project: serializeBigInt(created) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
