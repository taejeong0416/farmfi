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
  const platformFee = totalRevenue * 0.1;
  const opex = 1_400_000;
  const operatorBase = 450_000;

  let remaining = totalRevenue - platformFee - opex - operatorBase;

  let landlordShare = 0;
  let partnerRecovery = 0;
  let investorDividend = 0;
  let operatorBonus = 0;

  if (remaining > 0) {
    landlordShare = remaining * 0.22;
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

    investorDividend = remaining * 0.7;
    operatorBonus = remaining - investorDividend;
  }

  const breakdown = [
    { label: "운영비", amount: opex, color: "#9CA3AF" },
    { label: "운영자 기본급", amount: operatorBase, color: "#64748B" },
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
