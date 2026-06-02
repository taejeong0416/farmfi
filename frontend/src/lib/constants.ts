export const ProjectStatus = {
  UPCOMING: "upcoming",
  FUNDING: "funding",
  FUNDED: "funded",
  OPERATING: "operating",
  COMPLETED: "completed",
} as const;

export type ProjectStatus =
  (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const TransactionType = {
  SUBSCRIPTION: "subscription",
  TRANCHE_RELEASE: "tranche_release",
  DIVIDEND: "dividend",
  REVENUE: "revenue",
} as const;

export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];

export const MilestoneStatus = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  VERIFIED: "verified",
  COMPLETED: "completed",
  FAILED: "failed",
  MANUAL_REVIEW: "manual_review",
} as const;

export type MilestoneStatus =
  (typeof MilestoneStatus)[keyof typeof MilestoneStatus];
