import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { credentialNo } from "@/lib/credential";

/**
 * POST /api/operator/contracts/[id]/signature-request — 계약 전자서명 (O-07).
 *
 * 두 번 불린다. 서명값 없이 부르면 서명을 요청한 상태가 되고, 서명값과 함께
 * 부르면 서명이 끝난다. 실제 서명수단(Open DID Wallet)이 붙으면 두 호출 사이에
 * 사용자가 지갑에서 서명하는 시간이 들어간다 — 지금은 그 자리가 비어 있을 뿐
 * 흐름은 같다.
 *
 * 요청 없이 서명값만 보내면 받지 않는다. 무엇에 서명하는지 확인한 시점이
 * 남지 않으면 서명 시각만으로는 동의 과정을 설명할 수 없다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // 본문 없이 부르면 서명 요청
  }
  const signature =
    typeof (body as { signature?: unknown } | null)?.signature === "string"
      ? ((body as { signature: string }).signature).trim()
      : "";

  const contract = await prisma.operatorContract.findUnique({
    where: { id },
    include: {
      application: {
        select: { id: true, userId: true, spaceId: true, confirmedAt: true },
      },
    },
  });
  if (!contract || contract.application.userId !== session.userId) {
    return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (contract.status === "SIGNED") {
    return NextResponse.json({ contract, alreadySigned: true });
  }
  if (!contract.application.confirmedAt) {
    return NextResponse.json(
      { error: "공간을 먼저 확정해야 합니다." },
      { status: 400 },
    );
  }

  if (!signature) {
    const requested = await prisma.operatorContract.update({
      where: { id },
      data: {
        status: "SIGNATURE_REQUESTED",
        signatureRequestedAt: contract.signatureRequestedAt ?? new Date(),
      },
    });
    return NextResponse.json({ contract: requested });
  }

  if (contract.status !== "SIGNATURE_REQUESTED") {
    return NextResponse.json(
      { error: "서명 요청을 먼저 보내야 합니다." },
      { status: 400 },
    );
  }

  const signed = await prisma.operatorContract.update({
    where: { id },
    data: { status: "SIGNED", signature, signedAt: new Date() },
  });

  await prisma.operatorApplication.update({
    where: { id: contract.application.id },
    data: {
      contractSignature: signature,
      contractSignedAt: signed.signedAt,
    },
  });

  // 보증서는 서명이 끝나야 나온다. 발급 조건(교육 수료·공간 확정·계약 서명)이
  // 여기서 모두 채워지므로 관리자를 한 번 더 거치지 않고 바로 발급한다.
  //
  // 유효기간은 계약 종료일과 같다(명세 17.1-8). 계약 기간을 모르면 발급하지 않는다 —
  // 언제까지 유효한지 모르는 보증서는 앱에서 열고 닫을 기준이 없다.
  // 관리자 발급 경로(POST /api/admin/operator-credentials)는 개월 수로 잡는다.
  const already = await prisma.operatorCredential.findFirst({
    where: { applicationId: contract.application.id, status: "active" },
    select: { credentialNo: true },
  });

  let issuedNo: string | null = already?.credentialNo ?? null;
  let issueError: string | null = null;

  if (!already) {
    if (!signed.termEnd) {
      issueError = "계약 기간이 없어 보증서를 발급하지 못했습니다.";
    } else {
      const created = await prisma.operatorCredential.create({
        data: {
          credentialNo: credentialNo(contract.application.id),
          userId: contract.application.userId,
          applicationId: contract.application.id,
          spaceId: contract.application.spaceId ?? null,
          status: "active",
          expiresAt: signed.termEnd,
        },
      });
      issuedNo = created.credentialNo;
      await recordAudit({
        actorId: session.userId,
        actorRole: "system",
        action: "credential.issued",
        entityType: "user",
        entityId: contract.application.userId,
        summary: `계약 서명 완료로 운영자 보증서 발급 · ${created.credentialNo}`,
        detail: {
          credentialNo: created.credentialNo,
          expiresAt: created.expiresAt.toISOString(),
        },
      });
    }
  }

  return NextResponse.json({
    contract: signed,
    credentialNo: issuedNo,
    issueError,
  });
}
