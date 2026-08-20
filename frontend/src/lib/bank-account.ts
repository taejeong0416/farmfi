import { prisma } from "@/lib/db";
import {
  accountToken,
  getPaymentAdapter,
  maskAccountNumber,
  MOCK_HOLDER_ECHO,
} from "@/lib/payment";

/**
 * 회수·환불 계좌 확인 (C-I03).
 * 본인확인 결과의 이름과 예금주가 같을 때만 통과시킨다(명세 5.1 C-I03).
 * 계좌번호 원문은 저장하지 않는다 — 토큰과 마스킹값만 남긴다.
 */

export type HolderCheck =
  | { ok: true; holderName: string }
  | { ok: false; status: number; code: string; error: string };

export async function checkAccountHolder(params: {
  userId: string;
  bankName: string;
  accountNumber: string;
}): Promise<HolderCheck> {
  const { userId, bankName, accountNumber } = params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, status: 404, code: "USER_NOT_FOUND", error: "계정을 찾을 수 없습니다." };
  }
  if (!user.identityVerified) {
    return {
      ok: false,
      status: 400,
      code: "IDENTITY_REQUIRED",
      error: "본인확인을 먼저 마쳐야 계좌를 확인할 수 있습니다.",
    };
  }

  const lookup = await getPaymentAdapter().lookupAccountHolder({ bankName, accountNumber });
  if (!lookup) {
    return {
      ok: false,
      status: 400,
      code: "ACCOUNT_HOLDER_MISMATCH",
      error: "본인 명의 계좌인지 확인할 수 없어요.",
    };
  }

  const realName = user.realName ?? user.name;
  const holderName = lookup.holderName === MOCK_HOLDER_ECHO ? realName : lookup.holderName;
  if (holderName !== realName) {
    return {
      ok: false,
      status: 400,
      code: "ACCOUNT_HOLDER_MISMATCH",
      error: "본인 명의 계좌인지 확인할 수 없어요.",
    };
  }

  return { ok: true, holderName };
}

/** 확인에 성공한 계좌를 회수 계좌로 등록한다. 1인 1계좌라 기존 값을 덮어쓴다. */
export async function saveBankAccount(params: {
  userId: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
}) {
  const { userId, bankName, accountNumber, holderName } = params;
  const data = {
    bankName,
    maskedNumber: maskAccountNumber(accountNumber),
    accountToken: accountToken(bankName, accountNumber),
    holderName,
    verifiedAt: new Date(),
  };
  return prisma.bankAccount.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
