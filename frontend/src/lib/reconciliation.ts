import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getClients } from "@/lib/onchain";
import { isRelayEnabled } from "@/lib/chain-relay";

/**
 * 대사 — DB가 말하는 보유 구좌와 체인이 말하는 보유 구좌를 맞춰본다 (명세 10.4).
 *
 * 두 가지를 본다.
 *   영수증 재조회 — 전송은 했는데(SENT + 해시) 결과를 못 받은 건. 체인에 물어
 *                  성공이면 확정, 되돌려졌으면 실패로 닫는다.
 *   건수 대조     — 지갑별로 DB 확정 구좌 합과 체인 잔액을 비교한다.
 *
 * 불일치는 고치지 않는다. 어느 쪽이 맞는지는 기계가 판단할 수 없고, 잘못 맞추면
 * 구좌가 이중으로 생기거나 사라진다. ReconciliationEntry에 적어 사람에게 넘긴다.
 */

const FARM_TOKEN_ADDRESS = (process.env.ONCHAIN_FARM_TOKEN_ADDRESS ||
  process.env.FARM_TOKEN_ADDRESS) as `0x${string}` | undefined;

const FARM_TOKEN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * 같은 불일치가 회차마다 새 행으로 쌓이지 않게 한다. 이미 열려 있으면 관측값만
 * 갱신하고, 사람이 닫은 건(RESOLVED)은 다시 열지 않는다 — 닫았다는 판단을 덮지 않는다.
 */
async function recordEntry(input: {
  scopeKey: string;
  kind: string;
  entityType: string;
  entityId: string;
  expectedText: string;
  actualText: string;
  detail?: Prisma.InputJsonValue;
}): Promise<"created" | "updated" | "skipped"> {
  const existing = await prisma.reconciliationEntry.findUnique({
    where: { scopeKey: input.scopeKey },
  });
  if (existing?.status === "RESOLVED") return "skipped";

  if (existing) {
    await prisma.reconciliationEntry.update({
      where: { scopeKey: input.scopeKey },
      data: {
        expectedText: input.expectedText,
        actualText: input.actualText,
        detail: input.detail ?? undefined,
      },
    });
    return "updated";
  }

  await prisma.reconciliationEntry.create({
    data: {
      scopeKey: input.scopeKey,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      expectedText: input.expectedText,
      actualText: input.actualText,
      detail: input.detail ?? undefined,
    },
  });
  await prisma.notification.create({
    data: {
      type: "reconciliation_mismatch",
      message: `대사 불일치 · ${input.kind} · ${input.entityType} ${input.entityId} · 장부 ${input.expectedText} / 체인 ${input.actualText}`,
    },
  });
  return "created";
}

/**
 * 영수증 재조회. 해시는 남았는데 확정되지 않은 건을 체인에 다시 물어본다.
 *
 * Chain Relay는 전송 직후 해시를 먼저 적고 영수증을 기다린다. 그 사이에 프로세스가
 * 죽으면 SENT + 해시 상태로 남는다. Relay의 재시도도 이 건을 확정으로 넘기지만,
 * 그쪽은 "해시가 있으니 성공했다"고 가정한다. 여기서는 체인 영수증을 실제로 읽어
 * 되돌려진(reverted) 트랜잭션을 잡아낸다.
 */
export async function sweepReceipts(limit = 50): Promise<{
  checked: number;
  confirmed: number;
  reverted: number;
  pending: number;
}> {
  const rows = await prisma.holdingIssuance.findMany({
    where: {
      status: { in: ["PENDING", "SENT"] },
      chainTxHash: { not: null },
    },
    orderBy: { occurredAt: "asc" },
    take: limit,
  });

  const result = { checked: rows.length, confirmed: 0, reverted: 0, pending: 0 };
  if (rows.length === 0 || !isRelayEnabled()) return result;

  const { pub } = getClients();
  for (const row of rows) {
    const hash = row.chainTxHash as `0x${string}`;
    let receipt: { status: "success" | "reverted" } | null = null;
    try {
      receipt = await pub.getTransactionReceipt({ hash });
    } catch {
      // 아직 블록에 안 들어갔거나 노드가 못 찾는다. 다음 회차에 다시 본다.
      receipt = null;
    }

    if (!receipt) {
      result.pending++;
      continue;
    }

    if (receipt.status === "success") {
      await prisma.holdingIssuance.update({
        where: { id: row.id },
        data: {
          status: "CONFIRMED",
          settledAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
        },
      });
      result.confirmed++;
      continue;
    }

    // 되돌려졌다. 해시를 지워야 Relay의 "해시 있으면 확정" 방어선이 이 건을
    // 성공으로 오인하지 않는다. 재전송 여부는 사람이 정한다.
    await prisma.holdingIssuance.update({
      where: { id: row.id },
      data: {
        status: "CHAIN_FAILED",
        chainTxHash: null,
        nextAttemptAt: null,
        lastError: `체인에서 되돌려졌습니다 (tx ${hash}).`,
      },
    });
    await recordEntry({
      scopeKey: `receipt:${row.id}`,
      kind: "RECEIPT_REVERTED",
      entityType: "holding_issuance",
      entityId: row.id,
      expectedText: `${row.units}구좌 발행 성공`,
      actualText: "트랜잭션 revert",
      detail: { eventId: row.eventId, investmentId: row.investmentId, txHash: hash },
    });
    result.reverted++;
  }

  return result;
}

/**
 * 건수 대조. 지갑마다 DB 확정 구좌 합과 체인 잔액을 비교한다.
 *
 * 발행만 하고 아직 2차 이전이 없으므로 두 값은 같아야 한다. 이전이 생기면 이
 * 등식이 깨지므로, 그때는 이전 이력까지 더해 계산해야 한다.
 */
export async function reconcileHoldings(dayKey?: string): Promise<{
  wallets: number;
  matched: number;
  mismatched: number;
  skipped: boolean;
}> {
  if (!isRelayEnabled() || !FARM_TOKEN_ADDRESS) {
    return { wallets: 0, matched: 0, mismatched: 0, skipped: true };
  }

  const key = dayKey ?? new Date().toISOString().slice(0, 10);
  const wallets = await prisma.custodyWallet.findMany({
    select: { id: true, userId: true, chainAddress: true },
  });

  const sums = await prisma.holdingIssuance.groupBy({
    by: ["walletId"],
    where: { status: "CONFIRMED", method: "mint" },
    _sum: { units: true },
  });
  const ledger = new Map(sums.map((s) => [s.walletId, s._sum.units ?? 0]));

  const { pub } = getClients();
  let matched = 0;
  let mismatched = 0;

  for (const w of wallets) {
    const expected = ledger.get(w.id) ?? 0;
    let onchain: number;
    try {
      const raw = (await pub.readContract({
        address: FARM_TOKEN_ADDRESS,
        abi: FARM_TOKEN_ABI,
        functionName: "balanceOf",
        args: [w.chainAddress as `0x${string}`],
      })) as bigint;
      // decimals() == 0 이라 1구좌 = 정수 1. Number로 안전하게 떨어진다.
      onchain = Number(raw);
    } catch (e) {
      // 조회 자체가 안 되면 불일치로 단정하지 않는다. 다음 회차에 다시 본다.
      console.error("[reconciliation] balanceOf 실패", w.chainAddress, e);
      continue;
    }

    if (expected === onchain) {
      matched++;
      continue;
    }

    await recordEntry({
      scopeKey: `holding:${w.id}:${key}`,
      kind: "HOLDING_MISMATCH",
      entityType: "custody_wallet",
      entityId: w.id,
      expectedText: `${expected}구좌`,
      actualText: `${onchain}구좌`,
      detail: { userId: w.userId, chainAddress: w.chainAddress, dayKey: key },
    });
    mismatched++;
  }

  return { wallets: wallets.length, matched, mismatched, skipped: false };
}
