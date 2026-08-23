// 확정된 기간 매출·비용 읽기 (명세 2.1)
//
// 입력·확정은 `/api/admin/projects/[id]/records`가 한다. 여기 있는 것은 정산이
// 그 결과를 읽는 한 방향뿐이다 — draft는 절대 넘기지 않는다.
//
// 비용은 투자자 회수금을 깎지 않는다. 회수 재원은 FarmFi 수수료 풀이고 운영자
// 매출·비용은 운영자 것이다(v18 설계 원칙 2, waterfall.ts 주석). 비용이 들어가는
// 곳은 지급 원장의 운영자 정산 한 줄뿐이다.

import { prisma } from "@/lib/db";

export interface ConfirmedPeriodRecord {
  period: string;
  revenue: number;
  totalCost: number;
  confirmedAt: Date | null;
}

/**
 * 정산이 쓸 확정 입력값을 읽는다. 행이 없거나 draft면 null —
 * 호출자는 대체 경로(판매 기록 합계)로 간다.
 */
export async function resolveConfirmedRecord(
  projectId: string,
  period: string
): Promise<ConfirmedPeriodRecord | null> {
  const row = await prisma.periodRecord.findUnique({
    where: { projectId_period: { projectId, period } },
  });
  if (!row || row.status !== "confirmed") return null;
  return {
    period: row.period,
    revenue: Number(row.revenue),
    totalCost: Number(row.totalCost),
    confirmedAt: row.confirmedAt,
  };
}
