// Local label maps for the portfolio page. Kept self-contained (not imported
// from ../project/status.ts) so this feature has no cross-folder coupling to
// another agent's files — see ../project/status.ts for the sibling copy used
// on the project detail page.

export const PORTFOLIO_PROJECT_STATUS_LABEL: Record<string, string> = {
  upcoming: "오픈 예정",
  funding: "모집중",
  funded: "모집 완료",
  operating: "운영 중",
  completed: "종료",
};

export function portfolioProjectStatusLabel(status: string): string {
  return PORTFOLIO_PROJECT_STATUS_LABEL[status] ?? status;
}

export const PORTFOLIO_TX_TYPE_LABEL: Record<string, string> = {
  subscription: "청약 입금",
  tranche_release: "마일스톤 해제",
  dividend: "배당 지급",
  revenue: "매출 정산",
};
