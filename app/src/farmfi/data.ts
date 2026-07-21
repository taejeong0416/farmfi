// MobileFarmApp 데모 데이터 (원본 상수 이식)
export type ServiceKey = "store" | "assignment" | "growth" | "inventory" | "sales";
export type RackId = "A" | "B" | "C" | "D";
export type CropKind = "butter" | "romaine" | "basil" | "tomato";

export const BRANCHES = ["부산대 1호점", "연산 2호점", "수영 3호점"];

// 스프라이트(3열×2행) 내 작물 셀 위치 (col, row) — 0-indexed
export const CROP_CELL: Record<CropKind, { col: number; row: number }> = {
  butter: { col: 0, row: 0 },
  romaine: { col: 1, row: 0 },
  basil: { col: 2, row: 0 },
  tomato: { col: 0, row: 1 },
};

export const RACK_DATA: Record<
  RackId,
  { crop: string; kind: CropKind; state: string; stage: string; maturity: number; humidity: number }
> = {
  A: { crop: "버터헤드", kind: "butter", state: "정상", stage: "수확기", maturity: 92, humidity: 92 },
  B: { crop: "로메인", kind: "romaine", state: "정상", stage: "성장기", maturity: 75, humidity: 88 },
  C: { crop: "바질", kind: "basil", state: "정상", stage: "성장기", maturity: 68, humidity: 84 },
  D: { crop: "방울토마토", kind: "tomato", state: "관찰", stage: "착과기", maturity: 72, humidity: 78 },
};

export const STORE_DATA: Array<{ name: string; harvest: number; beds: number; rack: RackId }> = [
  { name: "부산대 1호점", harvest: 38, beds: 4, rack: "A" },
  { name: "연산 2호점", harvest: 24, beds: 4, rack: "B" },
  { name: "수영 3호점", harvest: 31, beds: 4, rack: "C" },
];

export const STOCK_ROWS: Array<{ kind: CropKind; name: string; stock: number; value: number }> = [
  { kind: "butter", name: "버터헤드", stock: 12, value: 68 },
  { kind: "romaine", name: "로메인", stock: 8, value: 53 },
  { kind: "basil", name: "바질", stock: 6, value: 40 },
  { kind: "tomato", name: "방울토마토", stock: 4, value: 31 },
];

export const LINKED_BEDS: Array<{
  rack: RackId;
  kind: CropKind;
  crop: string;
  maturity: number;
  harvest: string;
  yield: number;
}> = [
  { rack: "A", kind: "butter", crop: "버터헤드", maturity: 92, harvest: "2일 후", yield: 14 },
  { rack: "B", kind: "romaine", crop: "로메인", maturity: 75, harvest: "4일 후", yield: 10 },
  { rack: "C", kind: "basil", crop: "바질", maturity: 68, harvest: "6일 후", yield: 12 },
  { rack: "D", kind: "tomato", crop: "방울토마토", maturity: 45, harvest: "9일 후", yield: 8 },
];

export const SALES_RANKING: Array<{ kind: CropKind; name: string; count: number; value: number }> = [
  { kind: "butter", name: "버터헤드", count: 520, value: 100 },
  { kind: "romaine", name: "로메인", count: 320, value: 67 },
  { kind: "basil", name: "바질", count: 240, value: 51 },
  { kind: "tomato", name: "방울토마토", count: 200, value: 40 },
];

export const SALES_HISTORY = [
  ["07.16", "버터헤드", "2팩", "18,000원"],
  ["07.16", "로메인", "1팩", "8,500원"],
  ["07.15", "바질", "1팩", "6,000원"],
];

export const CHART_VALUES = [52, 102, 82, 128, 102, 82, 102, 103, 151, 127, 169, 103, 153, 104, 151];

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
