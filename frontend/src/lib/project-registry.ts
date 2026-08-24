/**
 * ProjectRegistry 배선 (명세 v2.1 §9.1).
 *
 * 명세가 요구하는 것은 "단위경제 모델 버전과 계약서 해시 저장"이다. 그 값이
 * 체인에 있어야 **투자자가 동의한 계약서를 나중에 고쳐 쓸 수 없다**가 성립한다.
 *
 * 계약서는 `Agreement` 테이블의 활성 투자계약서다. 본문 해시가 지문이 되고,
 * 문서를 고치면 version이 올라가면서 해시가 바뀐다 — 그때 amendContract가
 * 이전 해시와 함께 이벤트를 남긴다. 개정을 막는 게 아니라 숨길 수 없게 한다.
 *
 * AuditTrail과 같은 규칙 — 실패해도 업무를 막지 않는다(명세 마지막 원칙 c).
 */
import { prisma } from "@/lib/db";
import { getClients, GAS_OPTS, isOnchainEnabled } from "@/lib/onchain";
import { hashToBytes32, ref } from "@/lib/audit-trail";

const REGISTRY_ADDRESS = (process.env.ONCHAIN_PROJECT_REGISTRY_ADDRESS ?? "")
  .trim()
  .replace(/^["']|["']$/g, "") as `0x${string}` | "";

/** 서버 상태 문자열을 컨트랙트가 쓰는 코드로 옮긴다. 0은 미등록이라 쓰지 않는다. */
const STATE_CODE: Record<string, number> = {
  upcoming: 1,
  funding: 2,
  funded: 3,
  operating: 4,
  paused: 5,
  rejected: 6,
  completed: 7,
  failed: 8,
};

export function isProjectRegistryEnabled(): boolean {
  return isOnchainEnabled() && REGISTRY_ADDRESS.length === 42;
}

const REGISTRY_ABI = [
  {
    type: "function",
    name: "registerProject",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "contractHash", type: "bytes32" },
      { name: "economicsVersion", type: "bytes32" },
      { name: "spaceRef", type: "bytes32" },
      { name: "operatorRef", type: "bytes32" },
      { name: "state", type: "uint8" },
      { name: "registeredAt", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setState",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "newState", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "amendContract",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "newContractHash", type: "bytes32" },
      { name: "newEconomicsVersion", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isCurrentContract",
    inputs: [
      { name: "projectRef", type: "bytes32" },
      { name: "contractHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "projects",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "contractHash", type: "bytes32" },
      { name: "economicsVersion", type: "bytes32" },
      { name: "spaceRef", type: "bytes32" },
      { name: "operatorRef", type: "bytes32" },
      { name: "state", type: "uint8" },
      { name: "registeredAt", type: "uint256" },
      { name: "amendments", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

/** 지금 유효한 투자계약서의 해시와 버전. 문서가 없으면 null. */
export async function activeContractOf(): Promise<{ hash: string; version: string } | null> {
  const doc = await prisma.agreement.findFirst({
    where: { code: "investment_contract", isActive: true },
    select: { contentHash: true, version: true },
  });
  if (!doc?.contentHash) return null;
  return { hash: doc.contentHash, version: doc.version };
}

async function readProject(projectRef: `0x${string}`) {
  const { pub } = getClients();
  return (await pub.readContract({
    address: REGISTRY_ADDRESS as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "projects",
    args: [projectRef],
  })) as readonly [string, string, string, string, number, bigint, bigint];
}

/**
 * 프로젝트를 체인에 올린다. 이미 있으면 계약서가 바뀐 경우에만 개정을 기록한다.
 * 투자 동의처럼 "그 계약서가 체인에 있어야 의미가 생기는" 지점에서 부른다.
 */
export async function ensureProjectOnChain(projectId: string): Promise<string | null> {
  if (!isProjectRegistryEnabled()) return null;

  try {
    const [project, contract] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, status: true, location: true, operatorId: true },
      }),
      activeContractOf(),
    ]);
    if (!project || !contract) return null;

    const projectRef = ref("project", project.id);
    const contractHash = hashToBytes32(contract.hash);
    const economicsVersion = ref("economics", contract.version);
    const state = STATE_CODE[project.status] ?? 1;

    const onChain = await readProject(projectRef);
    const registered = onChain[0] !== `0x${"0".repeat(64)}`;

    const { wallet, pub } = getClients();

    if (!registered) {
      const hash = await wallet.writeContract({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: "registerProject",
        args: [
          ref("project-register", project.id, contract.hash),
          projectRef,
          contractHash,
          economicsVersion,
          ref("space", project.location),
          ref("operator", project.operatorId),
          state,
          BigInt(Math.floor(Date.now() / 1000)),
        ],
        ...GAS_OPTS,
      });
      await pub.waitForTransactionReceipt({ hash });
      return hash;
    }

    // 이미 있는데 계약서가 달라졌다 — 개정 이력을 남긴다.
    if (onChain[0].toLowerCase() !== contractHash.toLowerCase()) {
      const hash = await wallet.writeContract({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: "amendContract",
        args: [
          ref("project-amend", project.id, contract.hash),
          projectRef,
          contractHash,
          economicsVersion,
        ],
        ...GAS_OPTS,
      });
      await pub.waitForTransactionReceipt({ hash });
      return hash;
    }

    return null;
  } catch (e) {
    console.error("ProjectRegistry.ensureProject 실패:", e);
    return null;
  }
}

/** 프로젝트 상태 전환을 체인에 남긴다. 등록 전이면 등록이 먼저다. */
export async function syncProjectStateOnChain(
  projectId: string,
  status: string,
): Promise<string | null> {
  if (!isProjectRegistryEnabled()) return null;
  const code = STATE_CODE[status];
  if (!code) return null;

  try {
    await ensureProjectOnChain(projectId);
    const projectRef = ref("project", projectId);
    const onChain = await readProject(projectRef);
    if (onChain[0] === `0x${"0".repeat(64)}`) return null; // 등록 실패
    if (onChain[4] === code) return null; // 이미 그 상태다

    const { wallet, pub } = getClients();
    const hash = await wallet.writeContract({
      address: REGISTRY_ADDRESS as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "setState",
      args: [ref("project-state", projectId, status, String(onChain[4])), projectRef, code],
      ...GAS_OPTS,
    });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  } catch (e) {
    console.error("ProjectRegistry.syncState 실패:", e);
    return null;
  }
}

/**
 * 이 프로젝트의 계약서가 체인 기록과 같은가.
 * 화면·감사에서 "동의한 문서가 그대로인지"를 서버 말 말고 체인으로 확인한다.
 */
export async function isContractCurrentOnChain(projectId: string): Promise<boolean | null> {
  if (!isProjectRegistryEnabled()) return null;
  try {
    const contract = await activeContractOf();
    if (!contract) return null;
    const { pub } = getClients();
    return (await pub.readContract({
      address: REGISTRY_ADDRESS as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "isCurrentContract",
      args: [ref("project", projectId), hashToBytes32(contract.hash)],
    })) as boolean;
  } catch (e) {
    console.error("ProjectRegistry.isCurrentContract 실패:", e);
    return null;
  }
}
