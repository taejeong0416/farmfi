import { prisma } from "@/lib/db";
import {
  enqueueMintHolding,
  ensureWalletForInvestor,
  mintEventId,
  processIssuance,
} from "@/lib/chain-relay";
import { getFundCustodyAdapter, fundCustodyStatus } from "@/lib/fund-custody";
import { settleInvestment } from "@/lib/investment";
import {
  depositDeadline,
  getPaymentAdapter,
  PaymentAdapterError,
  type BankDeposit,
} from "@/lib/payment";

/**
 * 가상계좌 납입 (명세 5.2 I-03 · 10.4).
 *
 * 동의를 마친 신청에 건별 가상계좌를 발급하고, 은행 웹훅 또는 입금 조회로
 * 입금이 확인되면 신청을 DEPOSIT_CONFIRMED로 옮긴 뒤 청약을 확정한다.
 * 같은 거래번호는 DepositEvent.providerTransactionId unique로 한 번만 처리한다.
 */

/** I-03E가 구분하는 네 분기. */
export type DepositFailureCode =
  | "VIRTUAL_ACCOUNT_FAILED"
  | "DEPOSIT_EXPIRED"
  | "AMOUNT_MISMATCH"
  | "DEPOSIT_INQUIRY";

const FAILURE_MESSAGE: Record<DepositFailureCode, string> = {
  VIRTUAL_ACCOUNT_FAILED: "입금 계좌를 만들지 못했어요.",
  DEPOSIT_EXPIRED: "입금 시간이 지났어요.",
  AMOUNT_MISMATCH: "신청 금액과 입금액이 달라 확인이 필요해요.",
  DEPOSIT_INQUIRY: "입금 확인을 요청했어요. 확인되면 알려드릴게요.",
};

type Fail = { ok: false; status: number; code: string; error: string };

/**
 * 건별 가상계좌 발급. 이미 발급된 계좌가 있으면 취소하고 새로 받는다
 * (I-03E의 `가상계좌 다시 받기`도 이 경로를 쓴다).
 */
export async function issueVirtualAccount(
  investmentId: string,
): Promise<{ ok: true; account: Awaited<ReturnType<typeof createAccountRow>> } | Fail> {
  const investment = await prisma.investment.findUnique({ where: { id: investmentId } });
  if (!investment) {
    return { ok: false, status: 404, code: "NOT_FOUND", error: "신청 내역을 찾을 수 없습니다." };
  }
  if (investment.status !== "AWAITING_DEPOSIT") {
    return { ok: false, status: 400, code: "INVALID_STATE", error: "납입 단계가 아닙니다." };
  }
  if (investment.amount <= BigInt(0)) {
    return { ok: false, status: 400, code: "INVALID_STATE", error: "신청 금액이 없습니다." };
  }

  const expiresAt = depositDeadline();
  let issued;
  try {
    issued = await getPaymentAdapter().issueVirtualAccount({
      investmentId,
      amount: investment.amount,
      expiresAt,
    });
  } catch (e) {
    const code = e instanceof PaymentAdapterError ? e.code : "VIRTUAL_ACCOUNT_FAILED";
    await markFailure(investmentId, "VIRTUAL_ACCOUNT_FAILED");
    return {
      ok: false,
      status: 502,
      code,
      error: FAILURE_MESSAGE.VIRTUAL_ACCOUNT_FAILED,
    };
  }

  const account = await createAccountRow(investmentId, issued);
  await prisma.investment.update({
    where: { id: investmentId },
    data: { failureCode: null, failureReason: null },
  });
  return { ok: true, account };
}

async function createAccountRow(
  investmentId: string,
  issued: {
    provider: string;
    providerAccountId: string;
    bankName: string;
    accountNumber: string;
    holderName: string;
    amount: bigint;
    expiresAt: Date;
    providerSecret?: string | null;
  },
) {
  // 이전에 발급한 계좌는 닫는다. 유효한 계좌는 항상 한 건이다.
  await prisma.virtualAccount.updateMany({
    where: { investmentId, status: "ISSUED" },
    data: { status: "CANCELLED" },
  });
  return prisma.virtualAccount.upsert({
    where: { providerAccountId: issued.providerAccountId },
    create: { investmentId, ...issued, status: "ISSUED" },
    update: {
      bankName: issued.bankName,
      accountNumber: issued.accountNumber,
      holderName: issued.holderName,
      amount: issued.amount,
      expiresAt: issued.expiresAt,
      providerSecret: issued.providerSecret ?? null,
      status: "ISSUED",
    },
  });
}

export type DepositOutcome =
  | "CONFIRMED"
  | "AMOUNT_MISMATCH"
  | "LATE"
  | "REVIEW"
  | "DUPLICATE";

/**
 * 은행 입금 반영. 웹훅과 입금 조회가 같은 경로를 쓴다.
 * 금액이 다르거나 기한이 지난 입금은 자동 확정하지 않고 관리자 검토 큐로 보낸다.
 */
export async function confirmBankDeposit(input: {
  providerAccountId: string;
  providerTransactionId: string;
  amount: bigint;
  payerName?: string | null;
  depositedAt?: Date;
}): Promise<{ ok: true; outcome: DepositOutcome; investmentId: string } | Fail> {
  const account = await prisma.virtualAccount.findUnique({
    where: { providerAccountId: input.providerAccountId },
    include: { investment: true },
  });
  if (!account) {
    return { ok: false, status: 404, code: "NOT_FOUND", error: "입금 계좌를 찾을 수 없습니다." };
  }

  const existing = await prisma.depositEvent.findUnique({
    where: { providerTransactionId: input.providerTransactionId },
  });
  if (existing) {
    return { ok: true, outcome: "DUPLICATE", investmentId: account.investmentId };
  }

  const investment = account.investment;
  const depositedAt = input.depositedAt ?? new Date();
  // 취소된 신청으로 들어온 입금은 사람이 환불 판단을 한다.
  const outcome: Exclude<DepositOutcome, "DUPLICATE"> =
    account.status === "CANCELLED" || investment.status === "CANCELLED"
      ? "REVIEW"
      : input.amount !== investment.amount
        ? "AMOUNT_MISMATCH"
        : depositedAt > account.expiresAt
          ? "LATE"
          : "CONFIRMED";

  // 발행 대상 지갑을 트랜잭션 밖에서 먼저 확보한다. 지갑 생성은 체인을 건드리지
  // 않지만 DB 트랜잭션을 길게 잡을 이유가 없다. 수탁이 꺼져 있으면 null이고,
  // 그때는 발행을 걸지 않는다 — 입금 기록은 그대로 남는다.
  const custodyWallet =
    outcome === "CONFIRMED" ? await ensureWalletForInvestor(investment.userId) : null;

  await prisma.$transaction(async (tx) => {
    await tx.depositEvent.create({
      data: {
        investmentId: investment.id,
        providerTransactionId: input.providerTransactionId,
        amount: input.amount,
        expectedAmount: investment.amount,
        payerName: input.payerName ?? null,
        status: outcome,
        receivedAt: depositedAt,
      },
    });
    await tx.virtualAccount.update({
      where: { id: account.id },
      data: {
        status:
          outcome === "CONFIRMED" ? "PAID" : outcome === "LATE" ? "EXPIRED" : account.status,
      },
    });
    if (outcome !== "REVIEW") {
      const failureCode: DepositFailureCode | null =
        outcome === "CONFIRMED"
          ? null
          : outcome === "LATE"
            ? "DEPOSIT_EXPIRED"
            : "AMOUNT_MISMATCH";
      await tx.investment.update({
        where: { id: investment.id },
        data: {
          ...(outcome === "CONFIRMED" ? { status: "DEPOSIT_CONFIRMED" } : {}),
          failureCode,
          failureReason: failureCode ? FAILURE_MESSAGE[failureCode] : null,
        },
      });
    }

    // 입금 확인 바로 옆에서 보유 구좌 발행을 아웃박스에 건다 (명세 9.4).
    // 같은 트랜잭션이라 "입금은 확정됐는데 발행 의도가 사라진" 상태가 생기지 않고,
    // eventId가 입금 트랜잭션 ID에서 나오므로 웹훅이 두 번 와도 발행은 한 번이다.
    if (outcome === "CONFIRMED" && custodyWallet && investment.units > 0) {
      await enqueueMintHolding(tx, {
        eventId: mintEventId(input.providerTransactionId),
        investmentId: investment.id,
        walletId: custodyWallet.id,
        units: investment.units,
      });
    }
  });

  if (outcome === "CONFIRMED") {
    // 분리보관 계정 기록. 데모는 Mock이고 출시 시 신탁사 어댑터로 교체된다.
    await getFundCustodyAdapter()
      .recordDeposit({ investmentId: investment.id, amount: input.amount })
      .catch((e) => console.error("[deposit] 분리보관 기록 실패:", e));

    // 입금 확정과 청약 반영은 별개 이벤트다. 청약이 실패해도 입금 기록은 남는다.
    await settleInvestment(investment.id);

    // 체인 전송은 실패해도 입금·청약을 되돌리지 않는다. 실패하면 아웃박스에 남아
    // 재시도되고, 최대 횟수를 넘기면 CHAIN_FAILED로 운영 알림이 뜬다.
    if (custodyWallet) {
      const pending = await prisma.holdingIssuance.findUnique({
        where: { eventId: mintEventId(input.providerTransactionId) },
        select: { id: true, status: true },
      });
      if (pending && pending.status !== "CONFIRMED") {
        await processIssuance(pending.id).catch((e) =>
          console.error("[deposit] 보유 구좌 발행 전송 실패:", e),
        );
      }
    }
  }

  return { ok: true, outcome, investmentId: investment.id };
}

/**
 * 입금 상태 동기화. 기한이 지났으면 계좌를 닫고, 아직 유효하면 지급사에 입금을 조회한다.
 * 웹훅이 오지 않는 환경(로컬·데모)에서도 이 경로로 납입이 확정된다.
 */
export async function syncDepositStatus(investmentId: string) {
  const account = await prisma.virtualAccount.findFirst({
    where: { investmentId, status: "ISSUED" },
    orderBy: { createdAt: "desc" },
  });
  if (!account) return;

  if (account.expiresAt < new Date()) {
    await prisma.virtualAccount.update({
      where: { id: account.id },
      data: { status: "EXPIRED" },
    });
    await markFailure(investmentId, "DEPOSIT_EXPIRED");
    return;
  }

  let deposit: BankDeposit | null;
  try {
    deposit = await getPaymentAdapter().getDeposit({
      providerAccountId: account.providerAccountId,
      amount: account.amount,
      createdAt: account.createdAt,
    });
  } catch {
    // 조회 실패는 상태를 바꾸지 않는다. 다음 조회나 웹훅이 처리한다.
    return;
  }
  if (!deposit) return;

  await confirmBankDeposit({
    providerAccountId: account.providerAccountId,
    providerTransactionId: deposit.providerTransactionId,
    amount: deposit.amount,
    payerName: deposit.payerName,
    depositedAt: deposit.depositedAt,
  });
}

export async function markFailure(investmentId: string, code: DepositFailureCode) {
  await prisma.investment.update({
    where: { id: investmentId },
    data: { failureCode: code, failureReason: FAILURE_MESSAGE[code] },
  });
}

/** 화면(I-03·I-03E)이 쓰는 납입 상태 한 덩어리. */
export async function getDepositState(investmentId: string) {
  const [investment, account, lastEvent] = await Promise.all([
    prisma.investment.findUnique({ where: { id: investmentId } }),
    prisma.virtualAccount.findFirst({
      where: { investmentId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.depositEvent.findFirst({
      where: { investmentId },
      orderBy: { receivedAt: "desc" },
    }),
  ]);
  if (!investment) return null;

  return {
    status: investment.status,
    failureCode: investment.failureCode,
    failureReason: investment.failureReason,
    amount: investment.amount,
    virtualAccount: account
      ? {
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          holderName: account.holderName,
          amount: account.amount,
          expiresAt: account.expiresAt,
          status: account.status,
        }
      : null,
    deposit: lastEvent
      ? {
          amount: lastEvent.amount,
          expectedAmount: lastEvent.expectedAmount,
          status: lastEvent.status,
          receivedAt: lastEvent.receivedAt,
        }
      : null,
    // 투자금이 지금 어떻게 보관되는지 (명세 3.4). 문구는 어댑터가 정한다 —
    // 신탁사 연동이 붙으면 화면 코드를 고치지 않아도 표시가 따라 바뀐다.
    custody: fundCustodyStatus(),
  };
}
