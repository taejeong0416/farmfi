// Shared status label maps — keep in one place so ProjectGrid, the
// detail page, and the filter bar all agree on Korean copy.

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  upcoming: "오픈 예정",
  funding: "모집중",
  funded: "모집 완료",
  operating: "운영 중",
  completed: "종료",
};

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABEL[status] ?? status;
}

export const MILESTONE_STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  in_progress: "진행 중",
  verified: "검증 완료",
  completed: "완료",
  failed: "실패",
  manual_review: "수동 검토",
};

export const MILESTONE_STATUS_COLOR: Record<string, string> = {
  pending: "#c7cfc9",
  in_progress: "#e8a33d",
  verified: "#2f7fd1",
  completed: "#08703f",
  failed: "#c0392b",
  manual_review: "#c0392b",
};

export const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  subscription: "청약",
  tranche_release: "트랜치 해제",
  dividend: "배당",
  revenue: "매출",
};
