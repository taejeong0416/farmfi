import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confirmBankDeposit, markFailure } from "@/lib/deposit";

/**
 * POST /api/webhooks/toss/deposits — 토스페이먼츠 가상계좌 입금 통지 (DEPOSIT_CALLBACK).
 *
 * 본문은 `{ createdAt, secret, status, transactionKey, orderId }`뿐이다.
 * **금액이 없다** — 발급 때 지정한 금액이므로 저장된 계좌에서 읽는다.
 *
 * 검증은 HMAC이 아니라 계좌별 `secret` 대조다. 발급 응답의 secret을
 * `VirtualAccount.providerSecret`에 넣어 두고 여기서 맞춰 본다.
 *
 * 토스는 10초 안에 200을 못 받으면 재전송한다. 그래서 처리 실패가 아닌 상황
 * (모르는 상태값, 이미 처리된 건)은 200으로 닫아 무한 재시도를 만들지 않는다.
 *
 * @see https://docs.tosspayments.com/reference/using-api/webhook-events
 */
export async function POST(request: NextRequest) {
  let body: {
    secret?: unknown;
    status?: unknown;
    orderId?: unknown;
    transactionKey?: unknown;
    createdAt?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { secret, status, orderId, transactionKey } = body;
  if (typeof orderId !== "string" || !orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }
  if (typeof status !== "string") {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const account = await prisma.virtualAccount.findUnique({
    where: { providerAccountId: orderId },
  });
  if (!account) {
    // 우리 계좌가 아니다. 재전송을 유발하지 않게 200으로 닫는다.
    console.warn("[toss-webhook] 모르는 orderId", orderId);
    return NextResponse.json({ ok: true, ignored: "unknown_order" });
  }

  // secret 대조가 이 엔드포인트의 유일한 인증이다. 통과 못 하면 아무것도 하지 않는다.
  if (!account.providerSecret || secret !== account.providerSecret) {
    console.error("[toss-webhook] secret 불일치", orderId);
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  if (status === "DONE") {
    const result = await confirmBankDeposit({
      providerAccountId: account.providerAccountId,
      // 상태가 바뀐 거래를 특정하는 키. 재전송돼도 같은 값이라 중복 반영이 막힌다.
      providerTransactionId:
        typeof transactionKey === "string" && transactionKey
          ? `toss_${transactionKey}`
          : `toss_order_${orderId}`,
      // 웹훅에 금액이 없다. 발급 시 지정한 금액이 곧 입금액이다.
      amount: account.amount,
      payerName: account.holderName,
      depositedAt:
        typeof body.createdAt === "string" ? new Date(body.createdAt) : new Date(),
    });
    if (!result.ok) {
      // 우리 쪽 처리 실패는 재전송을 받는 편이 낫다.
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, outcome: result.outcome });
  }

  if (status === "CANCELED" || status === "EXPIRED") {
    await prisma.virtualAccount.update({
      where: { id: account.id },
      data: { status: status === "EXPIRED" ? "EXPIRED" : "CANCELLED" },
    });
    if (status === "EXPIRED") {
      await markFailure(account.investmentId, "DEPOSIT_EXPIRED");
    }
    return NextResponse.json({ ok: true, outcome: status });
  }

  // WAITING_FOR_DEPOSIT 등 — 아직 할 일이 없다.
  return NextResponse.json({ ok: true, outcome: status });
}
