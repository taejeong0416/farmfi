import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { checkAccountHolder } from "@/lib/bank-account";

// POST /api/bank-accounts/verify-holder — 예금주 확인 (C-I03).
// 확인만 하고 저장은 PATCH /api/me/bank-account가 한다.
export async function POST(request: NextRequest) {
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

  const result = await checkAccountHolder({
    userId: session.userId,
    bankName: bankName.trim(),
    accountNumber,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ holderName: result.holderName });
}
