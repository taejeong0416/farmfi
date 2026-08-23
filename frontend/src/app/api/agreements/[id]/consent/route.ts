import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { resolveAgreement, recordConsent } from "@/lib/agreements";

// POST /api/agreements/[id]/consent — 문서 한 건에 동의한다.
// 문서 버전·동의 시각·전자서명값·본인확인 세션을 남긴다 (명세 5.2).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const input = (body ?? {}) as { signature?: unknown; investmentId?: unknown };

  const signature =
    typeof input.signature === "string" ? input.signature.trim() : "";
  if (!signature) {
    return NextResponse.json({ error: "서명을 입력해 주세요." }, { status: 400 });
  }

  const agreement = await resolveAgreement(id);
  if (!agreement) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!agreement.isActive) {
    // 옛 버전은 읽을 수는 있어도 새로 동의할 수는 없다.
    return NextResponse.json(
      { error: "더 이상 유효하지 않은 문서입니다." },
      { status: 400 },
    );
  }

  // 명세 5.2 — 동의는 본인확인을 재확인한 뒤에 이뤄진다.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { identityVerified: true },
  });
  if (!user?.identityVerified) {
    return NextResponse.json(
      { error: "본인확인을 먼저 마쳐야 합니다." },
      { status: 400 },
    );
  }
  const verification = await prisma.identityVerification.findFirst({
    where: { userId: session.userId, status: "verified" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  let investmentId: string | null = null;
  if (typeof input.investmentId === "string" && input.investmentId) {
    const investment = await prisma.investment.findUnique({
      where: { id: input.investmentId },
      select: { userId: true },
    });
    if (!investment || investment.userId !== session.userId) {
      return NextResponse.json(
        { error: "신청 내역을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    investmentId = input.investmentId;
  }

  const { consent, created } = await recordConsent({
    userId: session.userId,
    agreement,
    investmentId,
    signature,
    identityVerificationId: verification?.id ?? null,
  });

  return NextResponse.json({
    consent: {
      id: consent.id,
      agreementId: consent.agreementId,
      contentHash: consent.contentHash,
      consentedAt: consent.consentedAt,
    },
    created,
  });
}
