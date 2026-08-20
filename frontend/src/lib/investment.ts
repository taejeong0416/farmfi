import { prisma } from "@/lib/db";
import { executeSubscription } from "@/lib/subscription";

/**
 * 투자 신청 한 건의 상태 흐름.
 * 화면(I-02 적합성 → I-03 최종확인·서명·납입 → I-04 완료)이 이 순서대로 밀고 나간다.
 */
export const INVESTMENT_STATUS = [
  "DRAFT",
  "IDENTITY_REQUIRED",
  "ELIGIBILITY_CHECKED",
  "CONSENT_REQUIRED",
  "AWAITING_DEPOSIT",
  "DEPOSIT_CONFIRMED",
  "COMPLETED",
  "DEPOSIT_FAILED",
  "CANCELLED",
] as const;

export type InvestmentStatus = (typeof INVESTMENT_STATUS)[number];

export const INVESTMENT_STATUS_LABEL: Record<InvestmentStatus, string> = {
  DRAFT: "작성 중",
  IDENTITY_REQUIRED: "본인확인 필요",
  ELIGIBILITY_CHECKED: "적합성 확인 완료",
  CONSENT_REQUIRED: "동의·서명 필요",
  AWAITING_DEPOSIT: "납입 대기",
  DEPOSIT_CONFIRMED: "납입 완료",
  COMPLETED: "신청 완료",
  DEPOSIT_FAILED: "납입 실패",
  CANCELLED: "취소됨",
};

export type EligibilityResult = {
  eligible: boolean;
  memo: string;
  annualLimit: bigint | null;
  /** 올해 이미 신청한 금액 */
  yearInvested: bigint;
};

/**
 * 적합성 판정. 본인확인 여부 · 연간 투자한도 · 프로젝트 잔여 물량을 함께 본다.
 * 자본시장법 룰엔진이 산출해 User에 저장한 한도를 그대로 집행한다.
 */
export async function judgeEligibility(params: {
  userId: string;
  projectId: string;
  amount: bigint;
}): Promise<EligibilityResult> {
  const { userId, projectId, amount } = params;

  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.project.findUnique({ where: { id: projectId } }),
  ]);

  if (!user) {
    return { eligible: false, memo: "계정을 찾을 수 없습니다.", annualLimit: null, yearInvested: BigInt(0) };
  }
  if (!project) {
    return { eligible: false, memo: "프로젝트를 찾을 수 없습니다.", annualLimit: null, yearInvested: BigInt(0) };
  }

  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: { userId, type: "subscription", createdAt: { gte: startOfYear } },
  });
  const yearInvested = agg._sum.amount ?? BigInt(0);
  const annualLimit = user.investorAnnualLimit;

  if (!user.identityVerified) {
    return {
      eligible: false,
      memo: "본인확인을 먼저 마쳐야 신청할 수 있습니다.",
      annualLimit,
      yearInvested,
    };
  }
  if (project.status !== "funding") {
    return {
      eligible: false,
      memo: "지금은 모집 중인 프로젝트가 아닙니다.",
      annualLimit,
      yearInvested,
    };
  }
  if (project.tokenPrice == null || project.totalTokens == null) {
    return {
      eligible: false,
      memo: "이 프로젝트는 모집 설정이 끝나지 않았습니다.",
      annualLimit,
      yearInvested,
    };
  }
  if (amount <= BigInt(0) || amount % project.tokenPrice !== BigInt(0)) {
    return {
      eligible: false,
      memo: `신청 금액은 ${project.tokenPrice.toLocaleString("ko-KR")}원 단위로 입력해야 합니다.`,
      annualLimit,
      yearInvested,
    };
  }

  const units = Number(amount / project.tokenPrice);
  if (project.soldTokens + units > project.totalTokens) {
    return {
      eligible: false,
      memo: "남은 모집 물량보다 신청 금액이 큽니다.",
      annualLimit,
      yearInvested,
    };
  }
  if (annualLimit != null && yearInvested + amount > annualLimit) {
    return {
      eligible: false,
      memo: `연간 투자한도(${annualLimit.toLocaleString("ko-KR")}원)를 넘습니다.`,
      annualLimit,
      yearInvested,
    };
  }
  if (user.balance < amount) {
    return {
      eligible: false,
      memo: "등록 계좌의 잔액이 신청 금액보다 적습니다.",
      annualLimit,
      yearInvested,
    };
  }

  return {
    eligible: true,
    memo: "신청 가능합니다.",
    annualLimit,
    yearInvested,
  };
}

/**
 * 입금이 확인된 신청을 청약으로 반영한다. 기존 executeSubscription을 감싸고
 * 성공·실패 결과만 Investment에 기록한다. 호출은 lib/deposit.ts가 한다.
 */
export async function settleInvestment(investmentId: string) {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    include: { project: true, user: true },
  });
  if (!investment) return { ok: false as const, status: 404, error: "신청 내역을 찾을 수 없습니다." };
  if (investment.status !== "DEPOSIT_CONFIRMED") {
    return { ok: false as const, status: 400, error: "입금이 확인되지 않았습니다." };
  }

  const result = await executeSubscription({
    userId: investment.userId,
    projectId: investment.projectId,
    tokenAmount: investment.units,
    annualLimit: investment.user.investorAnnualLimit,
  });

  if (!result.ok) {
    await prisma.investment.update({
      where: { id: investmentId },
      data: { status: "DEPOSIT_FAILED", failureReason: result.error },
    });
    return { ok: false as const, status: result.status, error: result.error };
  }

  const updated = await prisma.investment.update({
    where: { id: investmentId },
    data: {
      status: "COMPLETED",
      failureReason: null,
    },
  });

  return { ok: true as const, investment: updated, transaction: result.transaction };
}
