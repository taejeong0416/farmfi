import { prisma } from "@/lib/db";
import { getClients } from "@/lib/onchain";
import {
  FARM_TOKEN_ABI,
  FARM_TOKEN_ADDRESS,
  drainIssuances,
  isRelayEnabled,
  processIssuance,
} from "@/lib/chain-relay";

/**
 * 대사 (명세 Phase P5).
 *
 * 두 가지를 한다.
 *   1) 밀린 발행을 다시 태운다 — 재시도 시각이 지난 PENDING·SENT를 처리한다.
 *   2) DB가 발행했다고 아는 수량과 체인에 실제로 있는 수량을 맞춰 본다.
 *
 * **불일치를 자동으로 고치지 않는다.** 숫자가 어긋났다는 것은 어느 쪽이 틀렸는지
 * 모른다는 뜻이고, 그 상태에서 한쪽에 맞춰 쓰면 틀린 쪽을 정본으로 만들어 버린다.
 * 사람이 보도록 보고만 한다.
 */

export type WalletMismatch = {
  userId: string;
  userName: string;
  chainAddress: string;
  dbUnits: number;
  chainUnits: number | null;
  /** 체인 조회 자체가 실패한 경우 */
  unreadable: boolean;
};

export type ReconcileReport = {
  ranAt: string;
  relayEnabled: boolean;
  retried: { processed: number; confirmed: number; failed: number };
  counts: {
    /** DB에서 발행 완료로 아는 건수 */
    confirmed: number;
    pending: number;
    sent: number;
    chainFailed: number;
    cancelled: number;
    /** 전송했는데 영수증을 못 받은 채 멈춘 건 */
    stuckSent: number;
  };
  totals: { dbUnits: number; chainUnits: number | null };
  mismatches: WalletMismatch[];
  note: string;
};

/** 전송 후 이 시간이 지나도 CONFIRMED가 안 되면 멈춘 것으로 본다. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

export async function reconcileIssuances(): Promise<ReconcileReport> {
  const ranAt = new Date();

  // 1) 밀린 것 다시 태우기. 영수증만 못 받은 건은 processIssuance가
  //    재전송하지 않고 확정만 찍는다(chainTxHash가 이미 있으면).
  const retried = isRelayEnabled()
    ? await drainIssuances(50)
    : { processed: 0, confirmed: 0, failed: 0 };

  // SENT로 오래 멈춘 건을 한 번 더 건드린다.
  const stuck = await prisma.holdingIssuance.findMany({
    where: { status: "SENT", occurredAt: { lt: new Date(ranAt.getTime() - STUCK_AFTER_MS) } },
    select: { id: true },
    take: 50,
  });
  for (const row of stuck) {
    await processIssuance(row.id).catch(() => undefined);
  }

  const grouped = await prisma.holdingIssuance.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));

  // 2) 수량 대조. DB가 "발행 완료"로 아는 구좌를 지갑별로 모은다.
  const confirmed = await prisma.holdingIssuance.findMany({
    where: { status: "CONFIRMED" },
    select: {
      units: true,
      wallet: { select: { chainAddress: true, user: { select: { id: true, name: true } } } },
    },
  });

  const dbByWallet = new Map<
    string,
    { userId: string; userName: string; units: number }
  >();
  for (const row of confirmed) {
    const key = row.wallet.chainAddress;
    const cur = dbByWallet.get(key);
    if (cur) cur.units += row.units;
    else
      dbByWallet.set(key, {
        userId: row.wallet.user.id,
        userName: row.wallet.user.name,
        units: row.units,
      });
  }

  const dbUnits = [...dbByWallet.values()].reduce((sum, v) => sum + v.units, 0);

  const mismatches: WalletMismatch[] = [];
  let chainUnits: number | null = null;

  if (isRelayEnabled() && dbByWallet.size > 0) {
    const { pub } = getClients();
    let sum = 0;
    let allReadable = true;

    for (const [address, info] of dbByWallet) {
      let onChain: number | null = null;
      try {
        const raw = (await pub.readContract({
          address: FARM_TOKEN_ADDRESS!,
          abi: FARM_TOKEN_ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        })) as bigint;
        onChain = Number(raw);
        sum += onChain;
      } catch {
        allReadable = false;
      }
      if (onChain === null || onChain !== info.units) {
        mismatches.push({
          userId: info.userId,
          userName: info.userName,
          chainAddress: address,
          dbUnits: info.units,
          chainUnits: onChain,
          unreadable: onChain === null,
        });
      }
    }
    chainUnits = allReadable ? sum : null;
  }

  const note = !isRelayEnabled()
    ? "체인 설정이 없어 수량 대조를 건너뛰었습니다."
    : mismatches.length === 0
      ? "DB와 체인 수량이 일치합니다."
      : `${mismatches.length}개 지갑에서 수량이 어긋납니다. 자동으로 고치지 않았습니다 — 어느 쪽이 정본인지 확인이 필요합니다.`;

  return {
    ranAt: ranAt.toISOString(),
    relayEnabled: isRelayEnabled(),
    retried,
    counts: {
      confirmed: byStatus.CONFIRMED ?? 0,
      pending: byStatus.PENDING ?? 0,
      sent: byStatus.SENT ?? 0,
      chainFailed: byStatus.CHAIN_FAILED ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
      stuckSent: stuck.length,
    },
    totals: { dbUnits, chainUnits },
    mismatches,
    note,
  };
}
