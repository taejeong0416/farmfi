// 데모 자동재생(/demo)이 POST /api/demo/step 응답을 해석하는 데 쓰는 공용 타입 + 헬퍼.
// step 1~3 = 청약, 4~6·8 = 마일스톤 검증+해제, 7 = 배당. 응답 쉘(result)의 모양이
// step 종류마다 다르므로 여기서 한 번만 분기하고 StepList/StateMirror/page가 재사용한다.

import { formatKRW } from "@/lib/format";

export interface DemoStepResponse {
  step: number;
  status: string;
  result: unknown;
  fromCache?: boolean;
}

export interface SubscribeTransaction {
  txHash: string | null;
  amount: number;
  tokenAmount: number;
}

export interface SubscribeResult {
  success: boolean;
  transaction?: SubscribeTransaction;
  error?: string;
}

export interface VerifySignals {
  contract?: boolean;
  receipt?: boolean;
  photo?: boolean;
  iot?: boolean;
  crossCheck?: boolean;
}

export interface VerifyResult {
  passed: boolean;
  signals: VerifySignals;
  retryCount: number;
  txHash: string | null;
}

export interface CompleteMilestone {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
}

export interface CompleteResult {
  success: boolean;
  milestone: CompleteMilestone;
  txHash: string | null;
}

export interface MilestoneStepResult {
  verify: VerifyResult;
  complete: CompleteResult | null;
}

export interface DividendInfo {
  id: string;
  perToken: number;
  period: string;
  totalRevenue: number;
  totalDividend: number;
}

export interface WaterfallInfo {
  opex: number;
  landlordRent: number;
  platformFee: number;
  investorDividend: number;
  operatorResidual: number;
  breakdown: unknown[];
}

export interface DividendStepResult {
  waterfall: WaterfallInfo;
  dividend: DividendInfo;
  txHash: string | null;
}

export type StepKind = "subscribe" | "milestone" | "dividend";

export function stepKind(step: number): StepKind {
  if (step >= 1 && step <= 3) return "subscribe";
  if (step === 7) return "dividend";
  return "milestone";
}

/** 성공 시 실제로 온체인 기록된 tx가 있으면 그 해시를 뽑아온다. 배포 전이면 항상 null. */
export function stepTxHash(step: number, result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const kind = stepKind(step);
  if (kind === "subscribe") {
    return (result as SubscribeResult).transaction?.txHash ?? null;
  }
  if (kind === "dividend") {
    return (result as DividendStepResult).txHash ?? null;
  }
  const m = result as MilestoneStepResult;
  return m.complete?.txHash ?? m.verify?.txHash ?? null;
}

export function stepPassed(step: number, result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const kind = stepKind(step);
  if (kind === "subscribe") return (result as SubscribeResult).success === true;
  if (kind === "dividend") return !!(result as DividendStepResult).dividend;
  return (result as MilestoneStepResult).verify?.passed === true;
}

export function stepHeadline(step: number, result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const kind = stepKind(step);

  if (kind === "subscribe") {
    const r = result as SubscribeResult;
    if (!r.transaction) return r.error ?? "청약 실패";
    return `${r.transaction.tokenAmount.toLocaleString("ko-KR")}구좌 · ${formatKRW(r.transaction.amount)} 청약 완료`;
  }

  if (kind === "dividend") {
    const r = result as DividendStepResult;
    if (!r.dividend) return "배당 처리 실패";
    return `배당 ${formatKRW(r.dividend.totalDividend)} · 1구좌당 ${formatKRW(r.dividend.perToken)}`;
  }

  const r = result as MilestoneStepResult;
  if (!r.verify) return "";
  if (!r.verify.passed) {
    const failed = Object.entries(r.verify.signals ?? {})
      .filter(([, ok]) => !ok)
      .map(([k]) => k)
      .join(", ");
    return `AI 검증 미통과 (재시도 ${r.verify.retryCount}회) · 미통과 신호: ${failed || "-"}`;
  }
  if (!r.complete) return "검증 통과";
  return `검증 통과 → ${formatKRW(r.complete.milestone.releaseAmount)} 트랜치 해제`;
}

export interface DemoSummary {
  invested: number;
  released: number;
  totalDividend: number;
  returnRate: number;
}

const SUBSCRIBE_STEPS = [1, 2, 3];
const MILESTONE_STEPS = [4, 5, 6, 8];

export function computeSummary(
  results: Record<number, DemoStepResponse>,
): DemoSummary {
  let invested = 0;
  for (const step of SUBSCRIBE_STEPS) {
    const r = results[step]?.result as SubscribeResult | undefined;
    if (r?.transaction) invested += r.transaction.amount;
  }

  let released = 0;
  for (const step of MILESTONE_STEPS) {
    const r = results[step]?.result as MilestoneStepResult | undefined;
    if (r?.complete) released += r.complete.milestone.releaseAmount;
  }

  const dividendResult = results[7]?.result as DividendStepResult | undefined;
  const totalDividend = dividendResult?.dividend?.totalDividend ?? 0;

  const returnRate = invested > 0 ? (totalDividend / invested) * 100 : 0;

  return { invested, released, totalDividend, returnRate };
}
