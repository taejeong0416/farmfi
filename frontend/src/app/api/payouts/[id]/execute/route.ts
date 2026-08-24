import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getPayoutAdapter } from "@/lib/payout-adapter";
import { payoutFailurePolicy } from "@/lib/payout-failure";
import { recordPayoutOnChain } from "@/lib/audit-trail";

/**
 * POST /api/payouts/[id]/execute — 지급 어댑터로 이체를 실행한다.
 *
 * 기존 `/process`는 사람이 이체하고 결과를 손으로 적는 경로다. 이쪽은 서버가
 * 어댑터를 통해 직접 보낸다. 지금 어댑터는 Mock이고 화면에 그렇게 표시된다.
 *
 * 이중 이체를 막는 것이 이 라우트의 핵심이다. 상태 전이를 조건부 updateMany로
 * 먼저 잠그고(scheduled·failed → processing), 그 다음에 이체를 보낸다.
 * 사전 조회로 막으면 동시 요청 둘이 같은 건을 두 번 보낸다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await params;

  const payout = await prisma.payout.findUnique({
    where: { id },
    include: { project: { select: { name: true } } },
  });
  if (!payout) {
    return NextResponse.json({ error: "지급 건을 찾을 수 없습니다." }, { status: 404 });
  }
  if (payout.status === "paid") {
    return NextResponse.json({ error: "이미 지급 완료된 건입니다." }, { status: 400 });
  }

  // 실패한 건은 사유에 따라 다시 걸 수 있는지가 갈린다. 계좌가 잘못된 건을 그대로
  // 다시 보내면 같은 자리에서 또 실패하고 시도 횟수만 는다.
  if (payout.status === "failed") {
    const policy = payoutFailurePolicy(payout.failureCode);
    if (!policy.retryable) {
      return NextResponse.json(
        {
          error: policy.adminHint,
          code: "PAYOUT_RETRY_BLOCKED",
          failure: { code: policy.code, label: policy.label, actor: policy.actor },
        },
        { status: 409 },
      );
    }
  }

  // 여기서 잠근다. 이 전이에 성공한 요청만 이체를 보낸다.
  //
  // processing에 오래 머문 건도 다시 잡는다 — 이체를 넘긴 직후 프로세스가 죽으면
  // 그 행은 영영 processing에 갇혀 지급도 재시도도 못 한다. 어댑터가 멱등
  // (같은 payoutId면 같은 transferId)이라 다시 보내도 이중 이체가 되지 않는다.
  const STUCK_MS = 5 * 60 * 1000;
  const claimed = await prisma.payout.updateMany({
    where: {
      id,
      OR: [
        { status: { in: ["scheduled", "failed"] } },
        { status: "processing", createdAt: { lt: new Date(Date.now() - STUCK_MS) } },
      ],
    },
    data: {
      status: "processing",
      failureReason: null,
      failureCode: null,
      retryCount: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "다른 처리가 진행 중입니다. 새로고침 후 확인해 주세요." },
      { status: 409 },
    );
  }

  // 지급액이 0인 건은 보낼 것이 없다. 원장에서 지우지 않고 완료로 닫는다 —
  // "그 달 운영자 몫이 0이었다"는 사실도 정산 기록이다.
  if (payout.amount <= BigInt(0)) {
    const zero = await prisma.payout.update({
      where: { id },
      data: { status: "paid", paidAt: new Date(), failureReason: null, failureCode: null },
    });
    return NextResponse.json(
      serialize({ ok: true, payout: zero, skipped: "zero_amount" }),
    );
  }

  // 계정이 없는 수취인(건물주 파트너 등)은 애초에 자동 이체 대상이 아니다.
  // 어댑터에 넘겨 "계좌 없음"으로 실패시키면 뜻이 틀린다 — 실패가 아니라
  // 처리 경로가 다른 것이다. 사람이 이체하고 /process로 결과를 적는다.
  if (!payout.payeeUserId) {
    const manual = await prisma.payout.update({
      where: { id },
      data: {
        status: "scheduled",
        failureCode: null,
        failureReason: null,
        memo: payout.memo ? `${payout.memo} · 수동 이체 대상` : "수동 이체 대상",
      },
    });
    return NextResponse.json(
      serialize({
        ok: false,
        code: "PAYOUT_MANUAL_REQUIRED",
        error: "계정이 없는 수취인이라 자동 이체 대상이 아닙니다. 이체 후 결과를 등록해 주세요.",
        payout: manual,
        manual: true,
      }),
    );
  }

  const bankAccount = await prisma.bankAccount.findUnique({
    where: { userId: payout.payeeUserId },
  });

  const adapter = getPayoutAdapter();
  const result = await adapter.transfer({
    payoutId: payout.id,
    payeeName: payout.payeeName,
    amount: payout.amount,
    memo: `${payout.project.name} ${payout.period} ${payout.category}`,
    bankName: bankAccount?.bankName ?? null,
    accountToken: bankAccount?.accountToken ?? null,
    maskedNumber: bankAccount?.maskedNumber ?? null,
  });

  // 응답이 없어 결과를 모르는 경우. 여기서 재송금하면 이중 이체가 된다 —
  // 같은 거래번호로 지급사에 물어보는 것이 유일하게 안전한 길이다(명세 16.2).
  if (!result.ok && result.code === "PAYOUT_TIMEOUT") {
    const inquiry = await adapter.inquire(payout.id);

    if (inquiry.state === "sent") {
      // 이미 나갔다. 실패로 적었으면 사람이 다시 보냈을 상황이다.
      const paid = await prisma.payout.update({
        where: { id },
        data: {
          status: "paid",
          paidAt: inquiry.transferredAt,
          failureCode: null,
          failureReason: null,
          memo: payout.memo
            ? `${payout.memo} · ${inquiry.providerTransferId} (조회 확인)`
            : `${inquiry.providerTransferId} (조회 확인)`,
        },
      });
      const chainTxHash = await recordPayoutOnChain({
        eventId: `payout:${payout.id}:${inquiry.providerTransferId}`,
        projectId: payout.projectId,
        payoutId: payout.id,
        payeeRef: payout.payeeUserId ?? payout.id,
        amount: payout.amount,
        bankTransferId: inquiry.providerTransferId,
      });
      await recordAudit({
        actorId: session.userId,
        actorRole: "admin",
        action: "payout.processed",
        entityType: "payout",
        entityId: id,
        projectId: payout.projectId,
        summary: `지급 완료(조회 확인) · ${payout.payeeName} ${Number(payout.amount).toLocaleString("ko-KR")}원`,
        detail: { providerTransferId: inquiry.providerTransferId, inquiry: true, chainTxHash },
      });
      return NextResponse.json(
        serialize({ ok: true, payout: paid, inquiry: true, chainTxHash, provider: adapter.status() }),
      );
    }

    if (inquiry.state === "unknown") {
      // 지급사도 아직 모른다. 결정을 미루고 사람이 다시 부르게 둔다.
      const pending = await prisma.payout.update({
        where: { id },
        data: {
          status: "processing",
          failureCode: "PAYOUT_INQUIRY_PENDING",
          failureReason: inquiry.message,
        },
      });
      return NextResponse.json(
        serialize({
          ok: false,
          code: "PAYOUT_INQUIRY_PENDING",
          error: `${inquiry.message} 잠시 후 다시 확인해 주세요. 재송금하지 않았습니다.`,
          payout: pending,
        }),
      );
    }
    // not_found · failed — 나간 적이 없다. 아래 실패 처리로 내려간다.
  }

  if (!result.ok) {
    const failed = await prisma.payout.update({
      where: { id },
      data: { status: "failed", failureCode: result.code, failureReason: result.message },
    });
    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "payout.processed",
      entityType: "payout",
      entityId: id,
      projectId: payout.projectId,
      summary: `지급 실패 · ${payout.payeeName} ${Number(payout.amount).toLocaleString("ko-KR")}원 — ${result.message}`,
      detail: { code: result.code, provider: adapter.provider },
    });
    return NextResponse.json(
      serialize({ ok: false, code: result.code, error: result.message, payout: failed }),
      { status: 200 },
    );
  }

  const paid = await prisma.payout.update({
    where: { id },
    data: {
      status: "paid",
      paidAt: result.transferredAt,
      failureCode: null,
      failureReason: null,
      memo: payout.memo
        ? `${payout.memo} · ${result.providerTransferId}`
        : result.providerTransferId,
    },
  });

  // 지급 성공만 체인에 남긴다 (명세 9.6 recordPayout — 선행조건: 정산 확정·은행 지급 성공).
  // 실패 건은 올리지 않는다. 체인에 남길 것은 "돈이 실제로 나갔다"는 사실이다.
  const payoutTxHash = await recordPayoutOnChain({
    eventId: `payout:${payout.id}:${result.providerTransferId}`,
    projectId: payout.projectId,
    payoutId: payout.id,
    // 수취인 원문(이름·계좌)은 올리지 않는다. 계정 없는 수취인은 여기 오지 않는다.
    payeeRef: payout.payeeUserId ?? payout.id,
    amount: payout.amount,
    bankTransferId: result.providerTransferId,
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action: "payout.processed",
    entityType: "payout",
    entityId: id,
    projectId: payout.projectId,
    summary: `지급 완료 · ${payout.payeeName} ${Number(payout.amount).toLocaleString("ko-KR")}원 (${adapter.provider})`,
    detail: {
      providerTransferId: result.providerTransferId,
      provider: adapter.provider,
      chainTxHash: payoutTxHash,
    },
  });

  return NextResponse.json(
    serialize({ ok: true, payout: paid, provider: adapter.status(), chainTxHash: payoutTxHash }),
  );
}
