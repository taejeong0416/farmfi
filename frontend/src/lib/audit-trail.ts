/**
 * AuditTrail 배선 (명세 v2.1 §9.1 SettlementLedger/AuditTrail · §9.6 권한표).
 *
 * Escrow(집행 게이트)·FarmToken(보유 원장)이 담지 않는 다섯 가지 —
 * 계약 동의 · 입금 확인 · 증빙 해시 · 정산 확정 · 지급 결과 — 를 체인에 남긴다.
 *
 * **실패해도 업무 흐름을 막지 않는다.** 명세 마지막 원칙 (c)가 "서버 상태가 단일
 * 진실 공급원이고, 체인 기록은 비동기로 뒤따른다"이다. 여기서 throw하면 체인이
 * 죽었을 때 입금 확인과 지급이 같이 멈춘다. 그래서 전부 null 반환 + 에러 로그다.
 *
 * **원문을 올리지 않는다** (§9.2). 이름·계좌번호·CI가 들어갈 자리는 `ref()`를 통과한
 * sha256 참조값이다. 서버 시크릿을 섞지 않는 이유는, 이 값이 비밀이어야 하는 게
 * 아니라 **원문이 체인에 남지 않아야** 하는 것이기 때문이다. 대사할 때 서버가 같은
 * 입력으로 다시 계산해 맞춰본다.
 */
import { createHash } from "node:crypto";

import { getClients, GAS_OPTS, isOnchainEnabled } from "@/lib/onchain";

// env 값에 따옴표가 섞여 들어오는 사고가 있었다(DIVIDEND_ADDRESS). 벗겨서 읽는다.
const AUDIT_TRAIL_ADDRESS = (process.env.ONCHAIN_AUDIT_TRAIL_ADDRESS ?? "")
  .trim()
  .replace(/^["']|["']$/g, "") as `0x${string}` | "";

export function isAuditTrailEnabled(): boolean {
  return isOnchainEnabled() && AUDIT_TRAIL_ADDRESS.length === 42;
}

/** 내부 식별자를 체인에 올릴 bytes32 참조값으로 바꾼다. 원문은 올라가지 않는다. */
export function ref(...parts: (string | number | null | undefined)[]): `0x${string}` {
  const seed = parts.map((p) => String(p ?? "")).join(":");
  return `0x${createHash("sha256").update(seed).digest("hex")}`;
}

/** 파일 sha256(hex, 0x 없음)을 bytes32로. 업로드가 저장한 값을 그대로 쓴다. */
export function hashToBytes32(sha256Hex: string): `0x${string}` {
  const clean = sha256Hex.replace(/^0x/, "");
  if (clean.length !== 64) throw new Error(`sha256 길이가 아니다: ${clean.length}`);
  return `0x${clean}`;
}

const AUDIT_TRAIL_ABI = [
  {
    type: "function",
    name: "registerAgreement",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "investorRef", type: "bytes32" },
      { name: "agreementHash", type: "bytes32" },
      { name: "agreedAt", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "confirmDeposit",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "depositRef", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitEvidenceHash",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "milestoneSeq", type: "uint256" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "recordDisbursement",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "milestoneSeq", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "bankRef", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "confirmSettlement",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "periodRef", type: "bytes32" },
      { name: "distributable", type: "uint256" },
      { name: "ruleHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "recordPayout",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "projectRef", type: "bytes32" },
      { name: "payoutRef", type: "bytes32" },
      { name: "payeeRef", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "bankRef", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "recorded",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "entryCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

type Fn =
  | "registerAgreement"
  | "confirmDeposit"
  | "submitEvidenceHash"
  | "recordDisbursement"
  | "confirmSettlement"
  | "recordPayout";

async function write(fn: Fn, args: readonly unknown[]): Promise<string | null> {
  if (!isAuditTrailEnabled()) return null;
  try {
    const { wallet, pub } = getClients();
    const hash = await wallet.writeContract({
      address: AUDIT_TRAIL_ADDRESS as `0x${string}`,
      abi: AUDIT_TRAIL_ABI,
      functionName: fn,
      // ABI 인자 타입은 함수마다 달라 유니온으로는 좁혀지지 않는다. 호출부가
      // 아래 export 함수들을 통해서만 들어오므로 순서·타입은 거기서 고정된다.
      args: args as never,
      ...GAS_OPTS,
    });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  } catch (e) {
    // 체인이 죽어도 업무는 진행된다. 대사(reconciliation)가 나중에 차이를 잡는다.
    console.error(`AuditTrail.${fn} 실패:`, e);
    return null;
  }
}

/** 계약 동의를 체인에 남긴다 (§9.6 registerAgreement). */
export function recordAgreementOnChain(input: {
  eventId: string;
  projectId: string;
  investorUserId: string;
  agreementHash: string;
  agreedAt: Date;
}): Promise<string | null> {
  return write("registerAgreement", [
    ref(input.eventId),
    ref("project", input.projectId),
    ref("investor", input.investorUserId),
    hashToBytes32(input.agreementHash),
    BigInt(Math.floor(input.agreedAt.getTime() / 1000)),
  ]);
}

/** 입금 확인을 체인에 남긴다 (§9.6 confirmDeposit). */
export function recordDepositOnChain(input: {
  eventId: string;
  projectId: string;
  providerTransactionId: string;
  amount: bigint;
}): Promise<string | null> {
  return write("confirmDeposit", [
    ref(input.eventId),
    ref("project", input.projectId),
    ref("deposit", input.providerTransactionId),
    input.amount,
  ]);
}

/** 증빙 해시를 체인에 남긴다 (§9.6 submitEvidenceHash). */
export function recordEvidenceOnChain(input: {
  eventId: string;
  projectId: string;
  milestoneSeq: number;
  fileSha256: string;
}): Promise<string | null> {
  return write("submitEvidenceHash", [
    ref(input.eventId),
    ref("project", input.projectId),
    BigInt(input.milestoneSeq),
    hashToBytes32(input.fileSha256),
  ]);
}

/** 조성비 지급 결과를 체인에 남긴다 (§9.6 recordDisbursement). */
export function recordDisbursementOnChain(input: {
  eventId: string;
  projectId: string;
  milestoneSeq: number;
  amount: bigint;
  bankTransferId: string | null;
}): Promise<string | null> {
  return write("recordDisbursement", [
    ref(input.eventId),
    ref("project", input.projectId),
    BigInt(input.milestoneSeq),
    input.amount,
    ref("bank", input.bankTransferId),
  ]);
}

/** 정산 확정을 체인에 남긴다 (§9.6 confirmSettlement). */
export function recordSettlementOnChain(input: {
  eventId: string;
  projectId: string;
  period: string;
  distributable: bigint;
  ruleSignature: string;
}): Promise<string | null> {
  return write("confirmSettlement", [
    ref(input.eventId),
    ref("project", input.projectId),
    ref("period", input.period),
    input.distributable,
    ref("rule", input.ruleSignature),
  ]);
}

/** 지급 결과를 체인에 남긴다 (§9.6 recordPayout). */
export function recordPayoutOnChain(input: {
  eventId: string;
  projectId: string;
  payoutId: string;
  payeeRef: string;
  amount: bigint;
  bankTransferId: string | null;
}): Promise<string | null> {
  return write("recordPayout", [
    ref(input.eventId),
    ref("project", input.projectId),
    ref("payout", input.payoutId),
    ref("payee", input.payeeRef),
    input.amount,
    ref("bank", input.bankTransferId),
  ]);
}

/** 체인에 이미 기록된 eventId인지. 대사가 쓴다. */
export async function isRecordedOnChain(eventId: string): Promise<boolean | null> {
  if (!isAuditTrailEnabled()) return null;
  try {
    const { pub } = getClients();
    return (await pub.readContract({
      address: AUDIT_TRAIL_ADDRESS as `0x${string}`,
      abi: AUDIT_TRAIL_ABI,
      functionName: "recorded",
      args: [ref(eventId)],
    })) as boolean;
  } catch (e) {
    console.error("AuditTrail.recorded 조회 실패:", e);
    return null;
  }
}

/** 체인에 쌓인 기록 건수. 대사가 서버 카운트와 맞춰본다. */
export async function auditEntryCount(): Promise<bigint | null> {
  if (!isAuditTrailEnabled()) return null;
  try {
    const { pub } = getClients();
    return (await pub.readContract({
      address: AUDIT_TRAIL_ADDRESS as `0x${string}`,
      abi: AUDIT_TRAIL_ABI,
      functionName: "entryCount",
    })) as bigint;
  } catch (e) {
    console.error("AuditTrail.entryCount 조회 실패:", e);
    return null;
  }
}
