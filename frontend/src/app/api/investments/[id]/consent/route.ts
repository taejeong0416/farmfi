import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { missingRequiredConsents, agreementHashFor } from "@/lib/agreements";
import { recordAgreementOnChain } from "@/lib/audit-trail";
import { ensureProjectOnChain } from "@/lib/project-registry";

// POST /api/investments/[id]/consent — 최종 확인·전자서명 (I-03).
// 필수 문서에 전부 동의했는지 확인하고, 동의한 문서들을 묶은 해시를 신청에 남긴 뒤
// 납입 대기로 넘긴다. 문서별 동의는 POST /api/agreements/[id]/consent가 먼저 받는다.
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
  const signature = (body as { signature?: unknown } | null)?.signature;
  if (typeof signature !== "string" || !signature.trim()) {
    return NextResponse.json({ error: "서명을 입력해 주세요." }, { status: 400 });
  }

  const investment = await prisma.investment.findUnique({ where: { id } });
  if (!investment || investment.userId !== session.userId) {
    return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (investment.status !== "ELIGIBILITY_CHECKED" && investment.status !== "CONSENT_REQUIRED") {
    return NextResponse.json(
      { error: "적합성 확인을 먼저 마쳐야 합니다." },
      { status: 400 },
    );
  }

  // 필수 문서를 건너뛴 채로 넘어가지 못하게 막는다. 화면의 체크박스는 서버가
  // 확인할 수 없는 표시일 뿐이고, 동의 기록이 있어야 동의한 것이다.
  const missing = await missingRequiredConsents(session.userId, id);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "필수 문서에 모두 동의해야 합니다.",
        missing: missing.map((a) => ({ id: a.id, code: a.code, title: a.title })),
      },
      { status: 400 },
    );
  }

  const agreementHash = await agreementHashFor(session.userId, id);

  const updated = await prisma.investment.update({
    where: { id },
    data: {
      signature: signature.trim(),
      consentedAt: new Date(),
      agreementHash,
      status: "AWAITING_DEPOSIT",
    },
  });

  // 동의 사실을 체인에 남긴다 (명세 9.6 registerAgreement — 선행조건: 본인확인·계약 동의 완료).
  // 문서 원문이 아니라 해시만 올린다(명세 3.3). 나중에 문서를 고쳐 쓰면 해시가 어긋난다.
  // 동의보다 계약서가 먼저다. 프로젝트의 계약서 해시가 체인에 없으면 "이 사람이
  // 무엇에 동의했는지"를 나중에 증명할 수 없다 (명세 9.1 ProjectRegistry).
  await ensureProjectOnChain(updated.projectId);

  // 동의 문서가 없으면 해시도 없다. 그런 건 올릴 것이 없으므로 건너뛴다.
  const chainTxHash = agreementHash
    ? await recordAgreementOnChain({
        eventId: `agreement:${id}:${agreementHash}`,
        projectId: updated.projectId,
        investorUserId: session.userId,
        agreementHash,
        agreedAt: updated.consentedAt ?? new Date(),
      })
    : null;

  return NextResponse.json({ investment: serializeBigInt(updated), chainTxHash });
}
