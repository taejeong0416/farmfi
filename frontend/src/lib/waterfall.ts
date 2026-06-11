import { prisma } from "@/lib/db";

export interface WaterfallResult {
  opex: number;
  operatorBase: number;
  platformFee: number;
  landlordShare: number;
  partnerRecovery: number;
  investorDividend: number;
  operatorBonus: number;
  breakdown: { label: string; amount: number; color: string }[];
}

export async function calculateWaterfall(
  projectId: string,
  totalRevenue: number
): Promise<WaterfallResult> {
  // 운영자 기본급(45만)은 OPEX(140만)에 포함 — 별도 차감하지 않는다 (plan L2-4-4)
  const OPEX_TOTAL = 1_400_000;
  const operatorBase = 450_000;

  // 순차 차감: 각 단계는 남은 금액을 넘지 못함 (breakdown 합계 ≤ 매출)
  let remaining = totalRevenue;

  const platformFee = Math.min(Math.round(totalRevenue * 0.1), remaining);
  remaining -= platformFee;

  const opex = Math.min(OPEX_TOTAL, remaining);
  remaining -= opex;

  let landlordShare = 0;
  let partnerRecovery = 0;
  let investorDividend = 0;
  let operatorBonus = 0;

  if (remaining > 0) {
    landlordShare = Math.round(remaining * 0.22);
    remaining -= landlordShare;

    const partner = await prisma.projectPartner.findFirst({
      where: { projectId, role: "equipment_partner" },
    });

    if (partner && !partner.recoveryComplete) {
      partnerRecovery = Math.min(
        Number(partner.monthlyRecoveryAmount),
        remaining
      );
    }

    remaining -= partnerRecovery;

    investorDividend = Math.round(remaining * 0.7);
    operatorBonus = remaining - investorDividend;
  }

  const breakdown = [
    { label: "운영비 (운영자 기본급 포함)", amount: opex, color: "#9CA3AF" },
    { label: "플랫폼 수수료", amount: platformFee, color: "#D1D5DB" },
    { label: "건물주", amount: landlordShare, color: "#3B82F6" },
    { label: "설비파트너", amount: partnerRecovery, color: "#F97316" },
    { label: "투자자 배당", amount: investorDividend, color: "#22C55E" },
    { label: "운영자 보상", amount: operatorBonus, color: "#8B5CF6" },
  ];

  return {
    opex,
    operatorBase,
    platformFee,
    landlordShare,
    partnerRecovery,
    investorDividend,
    operatorBonus,
    breakdown,
  };
}
