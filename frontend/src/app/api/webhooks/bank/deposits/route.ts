import { NextRequest, NextResponse } from "next/server";
import { confirmBankDeposit } from "@/lib/deposit";
import { getPaymentAdapter } from "@/lib/payment";

/**
 * POST /api/webhooks/bank/deposits — 은행 입금 웹훅 (명세 10.4).
 *
 * 서명을 먼저 검증하고, 같은 거래번호는 한 번만 처리한다(중복 웹훅은 200으로 흘린다).
 * 금액이 다르거나 기한이 지난 입금은 확정하지 않고 관리자 검토 큐로 간다.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-farmfi-signature");
  if (!getPaymentAdapter().verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { providerAccountId, providerTransactionId, amount, payerName, depositedAt } =
    (body ?? {}) as Record<string, unknown>;

  if (typeof providerAccountId !== "string" || !providerAccountId) {
    return NextResponse.json({ error: "providerAccountId is required" }, { status: 400 });
  }
  if (typeof providerTransactionId !== "string" || !providerTransactionId) {
    return NextResponse.json({ error: "providerTransactionId is required" }, { status: 400 });
  }
  if (typeof amount !== "number" && typeof amount !== "string") {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }
  let parsedAmount: bigint;
  try {
    parsedAmount = BigInt(amount);
  } catch {
    return NextResponse.json({ error: "amount is invalid" }, { status: 400 });
  }

  const depositedDate = typeof depositedAt === "string" ? new Date(depositedAt) : new Date();
  if (Number.isNaN(depositedDate.getTime())) {
    return NextResponse.json({ error: "depositedAt is invalid" }, { status: 400 });
  }

  const result = await confirmBankDeposit({
    providerAccountId,
    providerTransactionId,
    amount: parsedAmount,
    payerName: typeof payerName === "string" ? payerName : null,
    depositedAt: depositedDate,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ outcome: result.outcome });
}
