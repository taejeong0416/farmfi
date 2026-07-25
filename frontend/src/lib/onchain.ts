import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// 서버 지갑(=배포자=VERIFIER)이 Escrow에 verifyMilestone·releaseTranche를
// 호출해 검증명제 ②③을 온체인에서 집행한다.
// ESCROW_ADDRESS / PRIVATE_KEY 가 .env에 없으면 비활성 → null 반환(배포 전 동작).
//
// 체인은 env로 결정한다(하드코딩 제거):
//   ONCHAIN_CHAIN_ID / ONCHAIN_RPC_URL / ONCHAIN_NAME / ONCHAIN_GAS_ZERO
// 미설정이면 Polygon Amoy(80002)로 폴백. OmniOne Chain(201210)은 gas 0이라
// ONCHAIN_GAS_ZERO=true 로 두면 legacy 트랜잭션 + gasPrice 0으로 전송한다.
// 이 모듈은 API 라우트(서버)에서만 쓰이므로 RPC URL의 비밀 토큰이 클라이언트로
// 노출되지 않는다(ONCHAIN_RPC_URL은 NEXT_PUBLIC_ 접두사 없이 서버 전용).

const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS as `0x${string}` | undefined;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;

const RPC_URL =
  process.env.ONCHAIN_RPC_URL ||
  process.env.NEXT_PUBLIC_AMOY_RPC ||
  "https://rpc-amoy.polygon.technology";
const CHAIN_ID = Number(process.env.ONCHAIN_CHAIN_ID || "80002");
const CHAIN_NAME = process.env.ONCHAIN_NAME || "Polygon Amoy";
// gas 0 체인(OmniOne Chain 등): true면 gasPrice 0 legacy 트랜잭션으로 보낸다.
const GAS_ZERO = process.env.ONCHAIN_GAS_ZERO === "true";

const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

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
    chain,
    transport: http(RPC_URL),
  });
  const pub = createPublicClient({
    chain,
    transport: http(RPC_URL),
  });
  return { wallet, pub };
}

// gas 0 체인이면 legacy(gasPrice 0)로 강제. 아니면 viem 기본 수수료 추정 사용.
// tsconfig target es2017이라 BigInt 리터럴(0n) 대신 BigInt() 생성자를 쓴다.
const GAS_OPTS = GAS_ZERO ? ({ gasPrice: BigInt(0) } as const) : ({} as const);

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
    ...GAS_OPTS,
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
    ...GAS_OPTS,
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

// ─── 블록 탐색기 링크 (온체인 증거 UI용) ───
// 체인별 탐색기 베이스 URL. 값이 ""면 공개 탐색기가 없는 체인이라는 뜻이고,
// 아래 두 헬퍼도 ""를 돌려준다 → 호출부는 링크 대신 해시/주소를 텍스트로만 렌더링한다.
const EXPLORER_BASE: Record<number, string> = {
  80002: "https://amoy.polygonscan.com", // Polygon Amoy
  137: "https://polygonscan.com", // Polygon mainnet
  201210: "", // OmniOne Chain — 공개 탐색기 없음
};

// 클라이언트 번들에는 NEXT_PUBLIC_ 접두사 env만 인라인된다. 서버 전용
// ONCHAIN_CHAIN_ID는 브라우저에서 undefined이므로, 체인을 Amoy 외로 바꾸면
// NEXT_PUBLIC_ONCHAIN_CHAIN_ID 도 같이 넣어야 링크가 올바른 탐색기를 가리킨다.
function explorerBase(): string {
  const chainId = Number(
    process.env.NEXT_PUBLIC_ONCHAIN_CHAIN_ID ||
      process.env.ONCHAIN_CHAIN_ID ||
      process.env.NEXT_PUBLIC_CHAIN_ID ||
      "80002"
  );
  return EXPLORER_BASE[chainId] ?? "";
}

// 트랜잭션 해시의 탐색기 URL. 탐색기 없는 체인이거나 해시가 비면 "".
export function explorerTxUrl(hash: string): string {
  const base = explorerBase();
  return base && hash ? `${base}/tx/${hash}` : "";
}

// 컨트랙트/지갑 주소의 탐색기 URL. 탐색기 없는 체인이거나 주소가 비면 "".
export function explorerAddressUrl(addr: string): string {
  const base = explorerBase();
  return base && addr ? `${base}/address/${addr}` : "";
}
