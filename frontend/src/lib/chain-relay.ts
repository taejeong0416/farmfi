import { prisma } from "@/lib/db";
import { getClients, GAS_OPTS } from "@/lib/onchain";
import { getOrCreateCustodyWallet, isCustodyEnabled } from "@/lib/custody";

/**
 * Chain Relay — 체인에 트랜잭션을 올리는 유일한 통로 (명세 9.5).
 *
 * 보유 구좌 발행·이전은 전부 운영키 트랜잭션이다. 투자자 개인키 서명은 발생하지
 * 않고(수탁 구조), 프론트엔드는 이 경로를 부를 수 없다 — 서버 모듈로만 쓴다.
 *
 * 파이프라인 (명세 9.4):
 *   은행 입금 확인 → 같은 트랜잭션에서 HoldingIssuance(PENDING) 기록
 *                 → Relay가 그 행을 집어 mint 전송 → CONFIRMED
 *   DB 커밋과 체인 전송은 한 트랜잭션에 묶을 수 없다. 그래서 "발행하기로 했다"는
 *   사실을 먼저 커밋하고(트랜잭셔널 아웃박스), 전송은 재시도로 따라붙게 한다.
 *   중간에 프로세스가 죽어도 PENDING 행이 남아 이어서 처리된다.
 */

const FARM_TOKEN_ADDRESS = (process.env.ONCHAIN_FARM_TOKEN_ADDRESS ||
  process.env.FARM_TOKEN_ADDRESS) as `0x${string}` | undefined;

const MAX_ATTEMPTS = 5;
/** 지수 백오프: 30초 · 1분 · 2분 · 4분 · 8분 */
const BACKOFF_MS = (attempts: number) => 30_000 * 2 ** Math.max(0, attempts - 1);

const FARM_TOKEN_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "registerIdentity",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "didHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "identity",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export { FARM_TOKEN_ABI, FARM_TOKEN_ADDRESS };

export function isRelayEnabled(): boolean {
  return (
    !!FARM_TOKEN_ADDRESS && FARM_TOKEN_ADDRESS.length === 42 && isCustodyEnabled()
  );
}

/** 입금 이벤트 하나에 대응하는 발행 이벤트 ID. 같은 웹훅이 두 번 와도 같은 값이 나온다. */
export function mintEventId(providerTransactionId: string): string {
  return `deposit:${providerTransactionId}:mint`;
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * 발행 의도를 아웃박스에 적는다. 호출자의 트랜잭션 안에서 실행해야
 * "입금은 확정됐는데 발행 기록이 없는" 상태가 생기지 않는다.
 *
 * eventId에 unique가 걸려 있어 재전송된 웹훅은 여기서 걸린다 — 두 번째 행이 안 생긴다.
 */
export async function enqueueMintHolding(
  tx: PrismaTx,
  input: { eventId: string; investmentId: string; walletId: string; units: number },
): Promise<{ enqueued: boolean }> {
  const existing = await tx.holdingIssuance.findUnique({
    where: { eventId: input.eventId },
  });
  if (existing) return { enqueued: false };

  await tx.holdingIssuance.create({
    data: {
      eventId: input.eventId,
      investmentId: input.investmentId,
      walletId: input.walletId,
      units: input.units,
      method: "mint",
      status: "PENDING",
      nextAttemptAt: new Date(),
    },
  });
  return { enqueued: true };
}

/**
 * 투자자의 수탁 지갑을 확보한다. 입금 확인 시점에 지갑이 없으면 여기서 만든다.
 * 지갑 생성은 체인을 건드리지 않으므로 트랜잭션 밖에서 먼저 끝내둔다.
 */
export async function ensureWalletForInvestor(userId: string) {
  if (!isCustodyEnabled()) return null;
  const wallet = await getOrCreateCustodyWallet(userId);
  // 지갑을 만들었으면 신원과 묶는다. 이게 §9.3 양도제한이 성립하는 근거다 —
  // FarmToken._update가 2차 이전 시 송·수신 지갑 모두 isVerified를 요구한다.
  // 실패해도 발행은 진행된다. mint는 신원 게이트 예외라 막히지 않는다.
  await registerIdentityOnChain(userId, wallet.chainAddress).catch((e) =>
    console.error("[relay] 신원 바인딩 실패:", e),
  );
  return wallet;
}

/**
 * 수탁 지갑 ↔ 신원 해시를 온체인에 묶는다 (명세 5.6 · FarmToken.registerIdentity).
 *
 * didHash는 `ciHash`를 쓴다 — 이미 서버 시크릿을 섞은 sha256이라 CI 원문이
 * 아니고, 1신원=1지갑을 강제하는 데 필요한 동일성만 갖는다. ciHash가 없는
 * 계정(신원 미검증)은 묶지 않는다. 묶을 신원이 없기 때문이다.
 *
 * 컨트랙트가 재등록을 거부하므로(이미 등록된 지갑·DID는 revert) 중복 호출은
 * 조용히 넘긴다. 여기서 던지면 입금 처리가 통째로 멈춘다.
 */
export async function registerIdentityOnChain(
  userId: string,
  chainAddress: string,
): Promise<string | null> {
  if (!FARM_TOKEN_ADDRESS || FARM_TOKEN_ADDRESS.length !== 42) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ciHash: true, identityVerified: true },
  });
  if (!user?.identityVerified || !user.ciHash) return null;

  const didHash = `0x${user.ciHash.replace(/^0x/, "")}` as `0x${string}`;
  if (didHash.length !== 66) return null;

  try {
    const { wallet: signer, pub } = getClients();
    // 이미 묶여 있으면 보내지 않는다 — 컨트랙트가 revert하고 가스만 태운다.
    const existing = (await pub.readContract({
      address: FARM_TOKEN_ADDRESS,
      abi: FARM_TOKEN_ABI,
      functionName: "identity",
      args: [chainAddress as `0x${string}`],
    })) as string;
    if (existing && existing !== `0x${"0".repeat(64)}`) return null;

    const hash = await signer.writeContract({
      address: FARM_TOKEN_ADDRESS,
      abi: FARM_TOKEN_ABI,
      functionName: "registerIdentity",
      args: [chainAddress as `0x${string}`, didHash],
      ...GAS_OPTS,
    });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  } catch (e) {
    console.error("registerIdentity 실패:", e);
    return null;
  }
}

/** 아웃박스에서 처리할 때가 된 발행 건을 집어 체인에 올린다. */
export async function drainIssuances(limit = 20): Promise<{
  processed: number;
  confirmed: number;
  failed: number;
}> {
  const due = await prisma.holdingIssuance.findMany({
    where: {
      status: { in: ["PENDING", "SENT"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { occurredAt: "asc" },
    take: limit,
  });

  let confirmed = 0;
  let failed = 0;
  for (const row of due) {
    const result = await processIssuance(row.id);
    if (result === "CONFIRMED") confirmed++;
    if (result === "CHAIN_FAILED") failed++;
  }
  return { processed: due.length, confirmed, failed };
}

/**
 * 발행 한 건. 이미 체인 해시가 있으면 다시 보내지 않는다 —
 * 재시도가 이중 발행이 되지 않게 하는 마지막 방어선이다.
 */
export async function processIssuance(
  issuanceId: string,
): Promise<"CONFIRMED" | "RETRY" | "CHAIN_FAILED" | "SKIPPED"> {
  const issuance = await prisma.holdingIssuance.findUnique({
    where: { id: issuanceId },
    include: { wallet: true, investment: { select: { status: true } } },
  });
  if (!issuance) return "SKIPPED";
  if (issuance.status === "CONFIRMED") return "SKIPPED";
  if (issuance.status === "CANCELLED") return "SKIPPED";

  // 입금이 확정돼도 청약 반영이 실패할 수 있다(잔여 물량 부족·한도 초과). 그 건은
  // 환불 대상이므로 구좌를 발행하면 안 된다. 아웃박스 행은 지우지 않고 취소로 닫는다 —
  // "발행하려다 왜 안 했는지"가 남아야 나중에 조사할 수 있다.
  const investmentStatus = issuance.investment.status;
  if (investmentStatus === "DEPOSIT_FAILED" || investmentStatus === "CANCELLED") {
    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: {
        status: "CANCELLED",
        nextAttemptAt: null,
        lastError: `청약이 ${investmentStatus}로 끝나 발행을 취소했습니다.`,
      },
    });
    return "SKIPPED";
  }
  // 아직 청약 반영 전이면 기다린다. 발행은 청약이 확정된 뒤에만 나간다.
  if (investmentStatus !== "COMPLETED") {
    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: {
        lastError: `청약 반영 대기 중 (신청 상태 ${investmentStatus}).`,
        nextAttemptAt: new Date(Date.now() + BACKOFF_MS(1)),
      },
    });
    return "RETRY";
  }
  if (issuance.chainTxHash) {
    // 전송은 됐는데 결과 기록 전에 죽은 경우. 다시 보내지 않고 확정만 찍는다.
    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: { status: "CONFIRMED", settledAt: new Date(), lastError: null },
    });
    return "CONFIRMED";
  }

  if (!isRelayEnabled()) {
    // 체인 설정 전이면 실패로 마감하지 않고 대기시킨다. 설정이 붙으면 이어서 나간다.
    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: {
        lastError: "체인 설정(FARM_TOKEN_ADDRESS·CUSTODY_MASTER_KEY)이 없습니다.",
        nextAttemptAt: new Date(Date.now() + BACKOFF_MS(1)),
      },
    });
    return "RETRY";
  }

  const attempts = issuance.attempts + 1;
  try {
    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: { status: "SENT", attempts },
    });

    const { wallet, pub } = getClients();
    const hash = await wallet.writeContract({
      address: FARM_TOKEN_ADDRESS!,
      abi: FARM_TOKEN_ABI,
      functionName: "mint",
      args: [issuance.wallet.chainAddress as `0x${string}`, BigInt(issuance.units)],
      ...GAS_OPTS,
    });
    // 해시를 먼저 남긴다. 영수증을 기다리다 죽어도 위의 재전송 방지가 걸린다.
    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: { chainTxHash: hash },
    });

    await pub.waitForTransactionReceipt({ hash });

    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: { status: "CONFIRMED", settledAt: new Date(), lastError: null },
    });
    return "CONFIRMED";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const exhausted = attempts >= MAX_ATTEMPTS;

    await prisma.holdingIssuance.update({
      where: { id: issuanceId },
      data: {
        status: exhausted ? "CHAIN_FAILED" : "PENDING",
        lastError: message.slice(0, 500),
        nextAttemptAt: exhausted ? null : new Date(Date.now() + BACKOFF_MS(attempts)),
      },
    });

    if (exhausted) {
      // 운영 알림. 여기서 멈추면 입금은 됐는데 원장에 없는 상태로 남는다 — 사람이 봐야 한다.
      await prisma.notification.create({
        data: {
          type: "CHAIN_FAILED",
          message: `보유 구좌 발행 실패 (${MAX_ATTEMPTS}회) · 신청 ${issuance.investmentId} · ${issuance.units}구좌 · ${message.slice(0, 200)}`,
        },
      });
      console.error("[chain-relay] mintHolding CHAIN_FAILED", issuance.eventId, message);
      return "CHAIN_FAILED";
    }
    return "RETRY";
  }
}
