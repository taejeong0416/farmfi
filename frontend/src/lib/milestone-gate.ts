/**
 * 마일스톤 상태 흐름. 조건부 집행의 뼈대다.
 *
 *   pending → evidence_submitted → in_progress → verified → completed
 *                     ↑                              │
 *              revision_required ←───────────────────┘ (보완 요청)
 *
 * 집행(complete)은 verified인 행만 통과시킨다. 증빙이 승인되지 않으면 자금이 나가지 않는다.
 */
export const MILESTONE_STATUS = [
  "pending",
  "evidence_submitted",
  "in_progress",
  "manual_review",
  "revision_required",
  "verified",
  "completed",
  "failed",
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: "예정",
  evidence_submitted: "증빙 제출됨",
  in_progress: "검증중",
  manual_review: "보류",
  revision_required: "보완 요청",
  verified: "통과",
  completed: "집행 완료",
  failed: "실패",
};

/** 운영자가 증빙을 새로 낼 수 있는 상태 */
export function canSubmitEvidence(status: string): boolean {
  return (
    status === "pending" ||
    status === "revision_required" ||
    status === "evidence_submitted" ||
    status === "manual_review"
  );
}

/** 관리자가 승인·보완요청 판정을 내릴 수 있는 상태 */
export function canReview(status: string): boolean {
  return (
    status === "evidence_submitted" ||
    status === "in_progress" ||
    status === "manual_review" ||
    status === "revision_required"
  );
}
