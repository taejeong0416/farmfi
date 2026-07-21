import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

// 서버 지갑(=배포자=VERIFIER)이 Escrow에 verifyMilestone·releaseTranche를
// 호출해 검증명제 ②③을 온체인에서 집행한다.
// ESCROW_ADDRESS / PRIVATE_KEY 가 .env에 없으면 비활성 → null 반환(배포 전 동작).

const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS as `0x${string}` | undefined;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const RPC_URL =
  process.env.NEXT_PUBLIC_AMOY_RPC || "https://rpc-amoy.polygon.technology";

export function isOnchainEnabled(): boolean {
  return (
    !!ESCROW_ADDRESS &&
    ESCROW_ADDRESS.length === 42 &&
    !!PRIVATE_KEY &&
    PRIVATE_KEY.length === 66
  );
}

// 호출하는 함수만 담은 최소 ABI
const ESCROW_ABI = [
  {
    type: "function",
    name: "verifyMilestone",
    inputs: [
      { name: "seq", type: "uint256" },
      { name: "passed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "releaseTranche",
    inputs: [{ name: "seq", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

function getClients() {
  const account = privateKeyToAccount(PRIVATE_KEY!);
  const wallet = createWalletClient({
    account,
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });
  const pub = createPublicClient({
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });
  return { wallet, pub };
}

// 마일스톤 검증 통과를 온체인에 기록 (VERIFIER_ROLE). 비활성·실패 시 null.
export async function verifyMilestoneOnChain(
  seq: number
): Promise<string | null> {
  if (!isOnchainEnabled()) return null;
  const { wallet, pub } = getClients();
  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS!,
    abi: ESCROW_ABI,
    functionName: "verifyMilestone",
    args: [BigInt(seq), true],
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

// 트랜치 자동집행 (검증 통과 + 순번 일치 시에만 컨트랙트가 허용). 비활성·실패 시 null.
export async function releaseTrancheOnChain(
  seq: number
): Promise<string | null> {
  if (!isOnchainEnabled()) return null;
  const { wallet, pub } = getClients();
  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS!,
    abi: ESCROW_ABI,
    functionName: "releaseTranche",
    args: [BigInt(seq)],
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}
