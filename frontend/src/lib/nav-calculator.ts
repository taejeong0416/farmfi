import { prisma } from "@/lib/db";

export async function calculateNAV(projectId: string): Promise<{
  nav: number;
  breakdown: { escrow: number; asset: number; cashFlow: number };
  previousNav: number;
  changeRate: number;
}> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      escrow: true,
      milestones: { where: { status: "completed" } },
      dividends: true,
    },
  });

  const escrowBalance = project.escrow ? Number(project.escrow.remaining) : 0;

  const assetValue = project.milestones.reduce(
    (sum, m) => sum + Number(m.assetValue),
    0,
  );

  const cashFlow = project.dividends.reduce(
    (sum, d) => sum + Number(d.totalDividend),
    0,
  );

  const nav = (escrowBalance + assetValue + cashFlow) / project.totalTokens;

  // Get the latest NAV snapshot for previous NAV; fall back to token price
  const latestSnapshot = await prisma.navSnapshot.findFirst({
    where: { projectId },
    orderBy: { recordedAt: "desc" },
  });

  const previousNav = latestSnapshot
    ? latestSnapshot.nav
    : Number(project.tokenPrice);

  const changeRate =
    previousNav !== 0 ? ((nav - previousNav) / previousNav) * 100 : 0;

  return {
    nav,
    breakdown: { escrow: escrowBalance, asset: assetValue, cashFlow },
    previousNav,
    changeRate,
  };
}
