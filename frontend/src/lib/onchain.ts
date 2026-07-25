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
  {
    type: "function",
    name: "triggerTimeoutFailure",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "milestoneDeadline",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "projectFailed",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

// Escrow.sol의 `uint256 public constant MILESTONE_TIMEOUT = 180 days`를 미러링한다.
// 마일스톤 deadlineAt(DB) 계산의 단일 출처 — 컨트랙트를 바꾸면 여기도 같이 바꿔야 한다.
export const MILESTONE_TIMEOUT_DAYS = 180;
export const MILESTONE_TIMEOUT_MS = MILESTONE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000;

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

// 마감 경과 시 프로젝트를 실패로 전환 (permissionless — 컨트랙트가 누구의 호출이든 받는다).
// 컨트랙트 가드가 `block.timestamp > milestoneDeadline`이라, 배포 후 180일이 지나기
// 전에는 "Deadline not passed"로 반드시 revert한다. 시연 구간에서는 이 호출이 실패하는
// 게 정상이고, DB 레벨 실패 전환(POST /api/milestones/[id]/timeout)이 상태를 진행시킨다.
// 비활성(주소·키 미설정) 시 null.
export async function triggerTimeoutFailureOnChain(): Promise<string | null> {
  if (!isOnchainEnabled()) return null;
  const { wallet, pub } = getClients();
  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS!,
    abi: ESCROW_ABI,
    functionName: "triggerTimeoutFailure",
    args: [],
    ...GAS_OPTS,
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

// Escrow.refund()에 대응하는 서버 헬퍼는 일부러 만들지 않았다. 컨트랙트 refund는
// `investments[msg.sender]`(온체인 subscribe로 쌓인 잔고) 기준이라 호출자 본인에게만
// 지급된다. 우리 앱의 청약은 DB(TokenHolding)에 기록되고 투자자가 온체인 subscribe를
// 호출한 적이 없어 investments[투자자] == 0 → 온체인 refund는 우리 투자자에게 revert한다.
// 따라서 환불은 POST /api/projects/[id]/refund가 DB 비례 계산으로 집행하고, 온체인
// refund()는 지갑으로 직접 청약한 온체인 투자자용 경로로 컨트랙트에 남겨둔다.

// 온체인 milestoneDeadline(unix seconds) 조회 → Date. 비활성 시 null.
// DB deadlineAt과 대조해 "DB 기한 vs 컨트랙트 기한" 차이를 보여줄 때 쓴다.
export async function readMilestoneDeadline(): Promise<Date | null> {
  if (!isOnchainEnabled()) return null;
  const { pub } = getClients();
  const seconds = await pub.readContract({
    address: ESCROW_ADDRESS!,
    abi: ESCROW_ABI,
    functionName: "milestoneDeadline",
  });
  // tsconfig target es2017이라 BigInt 리터럴(0n) 금지 — BigInt() 생성자만 쓴다.
  if (seconds === BigInt(0)) return null;
  return new Date(Number(seconds) * 1000);
}

// 온체인 projectFailed 플래그. 비활성 시 null.
export async function readProjectFailed(): Promise<boolean | null> {
  if (!isOnchainEnabled()) return null;
  const { pub } = getClients();
  return await pub.readContract({
    address: ESCROW_ADDRESS!,
    abi: ESCROW_ABI,
    functionName: "projectFailed",
  });
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
