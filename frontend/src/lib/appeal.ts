// 이의제기 공통 규칙 (명세 1.3) — 상태 전이표와 접근 범위를 한곳에 둔다.
//
// 상태: open(접수) → under_review(운영팀 검토) → escalated(외부 전문가) → approved / rejected
// 외부 전문가는 별도 계정 역할이 아니다(Role에 auditor가 없다). escalated 단계에서
// 운영팀이 전문가 의견을 authorRole="auditor" 코멘트로 대신 기록한다.

import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

export const APPEAL_STATUSES = [
  "open",
  "under_review",
  "escalated",
  "approved",
  "rejected",
] as const;

export type AppealStatus = (typeof APPEAL_STATUSES)[number];

/** 판정 액션별로 허용되는 이전 상태와 전이 결과. */
export const APPEAL_TRANSITIONS = {
  review: { from: ["open"], to: "under_review" },
  escalate: { from: ["open", "under_review"], to: "escalated" },
  approve: { from: ["under_review", "escalated"], to: "approved" },
  reject: { from: ["under_review", "escalated"], to: "rejected" },
} as const satisfies Record<string, { from: readonly AppealStatus[]; to: AppealStatus }>;

export type AppealAction = keyof typeof APPEAL_TRANSITIONS;

/** 이의제기를 접수할 수 있는 마일스톤 상태 — 보류·반려 건에만 허용한다. */
export function isAppealable(status: string, retryCount: number): boolean {
  return status === "manual_review" || status === "failed" || retryCount > 0;
}

/**
 * 세션이 이 프로젝트의 이의제기를 다룰 수 있는지 확인한다.
 * admin은 전부, 운영자는 자기가 운영하는 지점만.
 */
export async function canAccessProjectAppeal(
  session: SessionPayload,
  projectId: string
): Promise<boolean> {
  if (session.role === "admin") return true;
  if (session.role !== "operator") return false;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { operatorId: true },
  });
  return project?.operatorId === session.userId;
}
