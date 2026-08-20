import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { checkAccountHolder, saveBankAccount } from "@/lib/bank-account";

// 회수·환불 계좌 (C-I03). 응답에는 마스킹값만 싣는다.
function toResponse(account: {
  bankName: string;
  maskedNumber: string;
  holderName: string;
  verifiedAt: Date;
} | null) {
  if (!account) return null;
  return {
    bankName: account.bankName,
    maskedNumber: account.maskedNumber,
    holderName: account.holderName,
    verifiedAt: account.verifiedAt.toISOString(),
  };
}

// GET /api/me/bank-account — 등록된 회수 계좌 조회
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await prisma.bankAccount.findUnique({
    where: { userId: session.userId },
  });
  return NextResponse.json({ bankAccount: toResponse(account) });
}

// PATCH /api/me/bank-account — 회수 계좌 등록·변경.
// 예금주 확인을 서버에서 다시 하고 통과한 계좌만 저장한다.
export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { bankName, accountNumber } = (body ?? {}) as {
    bankName?: unknown;
    accountNumber?: unknown;
  };
  if (typeof bankName !== "string" || !bankName.trim()) {
    return NextResponse.json({ error: "은행을 선택해 주세요." }, { status: 400 });
  }
  if (typeof accountNumber !== "string" || accountNumber.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "계좌번호를 다시 확인해 주세요." }, { status: 400 });
  }

  const check = await checkAccountHolder({
    userId: session.userId,
    bankName: bankName.trim(),
    accountNumber,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error, code: check.code },
      { status: check.status },
    );
  }

  const account = await saveBankAccount({
    userId: session.userId,
    bankName: bankName.trim(),
    accountNumber,
    holderName: check.holderName,
  });

  return NextResponse.json({ bankAccount: toResponse(account) });
}
