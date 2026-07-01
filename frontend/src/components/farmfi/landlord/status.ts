// Shared Space.status → label/badge/progress maps, mirroring the pattern in
// ../project/status.ts so landlord + project views stay visually consistent.

export const SPACE_STATUS_LABEL: Record<string, string> = {
  submitted: "제출 완료",
  reviewing: "심사 중",
  approved: "계약 진행 중",
  rejected: "반려됨",
};

export const SPACE_STATUS_BADGE_CLASS: Record<string, string> = {
  submitted: "is-pending",
  reviewing: "is-pending",
  approved: "is-ok",
  rejected: "is-fail",
};

// 계약 진행률 — Space 모델엔 별도 퍼센트 컬럼이 없어 status 단계를 임대 계약
// 진행률로 매핑한다 (submitted 접수 → reviewing 심사 → approved 계약 완료).
export const SPACE_STATUS_PROGRESS: Record<string, number> = {
  submitted: 25,
  reviewing: 60,
  approved: 100,
  rejected: 0,
};

export function spaceStatusLabel(status: string): string {
  return SPACE_STATUS_LABEL[status] ?? status;
}

export function spaceStatusBadgeClass(status: string): string {
  return SPACE_STATUS_BADGE_CLASS[status] ?? "is-muted";
}

export function spaceStatusProgress(status: string): number {
  return SPACE_STATUS_PROGRESS[status] ?? 0;
}

export const SPACE_TYPE_LABEL: Record<string, string> = {
  rooftop: "옥상",
  vacant_store: "빈 점포",
  indoor: "실내 유휴공간",
};

export function spaceTypeLabel(spaceType: string): string {
  return SPACE_TYPE_LABEL[spaceType] ?? spaceType;
}

// .thumb 배경 변형 — rooftop/indoor만 전용 이미지가 있고 나머지는 기본(녹색) 배경.
export function spaceThumbVariant(spaceType: string): "roof" | "indoor" | "" {
  if (spaceType === "rooftop") return "roof";
  if (spaceType === "indoor") return "indoor";
  return "";
}
