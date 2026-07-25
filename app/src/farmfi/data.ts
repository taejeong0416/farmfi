// 픽셀아트 렌더링 상수 — 스프라이트 셀 좌표와 베드 슬롯 배치.
// 운영 수치(지점·재고·판매·생육)는 전부 API에서 온다. 여기에 목데이터를 다시
// 두면 API 실패 시 화면이 조용히 거짓을 말하게 되므로 추가하지 않는다.
export type ServiceKey = "store" | "assignment" | "growth" | "inventory" | "sales";
export type RackId = "A" | "B" | "C" | "D";
export type CropKind = "butter" | "romaine" | "basil" | "tomato";

// 스프라이트(3열×2행) 내 작물 셀 위치 (col, row) — 0-indexed
export const CROP_CELL: Record<CropKind, { col: number; row: number }> = {
  butter: { col: 0, row: 0 },
  romaine: { col: 1, row: 0 },
  basil: { col: 2, row: 0 },
  tomato: { col: 0, row: 1 },
};

// 재배 베드 슬롯 위치 (%) — 원본 LEAFY_SLOTS / TOMATO_SLOTS
export const LEAFY_SLOTS = [
  ...[29, 40.5, 52, 63.5, 75].map((x) => ({ x, y: 29.5 })),
  ...[29, 40.5, 52, 63.5, 75].map((x) => ({ x, y: 52.7 })),
  ...[29, 40.5, 52, 63.5, 75].map((x) => ({ x, y: 76.3 })),
];

export const TOMATO_SLOTS = [
  ...[29, 43.5, 58, 72.5].map((x) => ({ x, y: 44.1 })),
  ...[29, 43.5, 58, 72.5].map((x) => ({ x, y: 78.6 })),
];
