import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getPayoutAdapter } from "@/lib/payout-adapter";

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
    data: { status: "processing", failureReason: null },
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
      data: { status: "paid", paidAt: new Date(), failureReason: null },
    });
    return NextResponse.json(
      serialize({ ok: true, payout: zero, skipped: "zero_amount" }),
    );
  }

  // 수취인 계좌. 계정이 없는 수취인(건물주 파트너 등)은 등록 계좌가 없다.
  const bankAccount = payout.payeeUserId
    ? await prisma.bankAccount.findUnique({ where: { userId: payout.payeeUserId } })
    : null;

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

  if (!result.ok) {
    const failed = await prisma.payout.update({
      where: { id },
      data: { status: "failed", failureReason: result.message },
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
      failureReason: null,
      memo: payout.memo
        ? `${payout.memo} · ${result.providerTransferId}`
        : result.providerTransferId,
    },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action: "payout.processed",
    entityType: "payout",
    entityId: id,
    projectId: payout.projectId,
    summary: `지급 완료 · ${payout.payeeName} ${Number(payout.amount).toLocaleString("ko-KR")}원 (${adapter.provider})`,
    detail: { providerTransferId: result.providerTransferId, provider: adapter.provider },
  });

  return NextResponse.json(
    serialize({ ok: true, payout: paid, provider: adapter.status() }),
  );
}
