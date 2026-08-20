/**
 * 정기구독 요금과 회차 계산. 화면(B-02·B-04·B-07)과 API가 같은 규칙을 쓰도록 여기 모은다.
 */

export const PACK_SIZES = [3, 5, 7] as const;
export type PackSize = (typeof PACK_SIZES)[number];

/** 팩 크기별 월 기본가 (주 1회 기준) */
const BASE_PRICE: Record<PackSize, number> = {
  3: 19_000,
  5: 29_000,
  7: 39_000,
};

/** 주 2회로 받으면 회당 물량이 늘어난 만큼 더한다. */
const EXTRA_PER_WEEK = 20_000;

export function isPackSize(v: unknown): v is PackSize {
  return v === 3 || v === 5 || v === 7;
}

export function monthlyPrice(packSize: PackSize, perWeek: number): number {
  return BASE_PRICE[packSize] + (Math.max(1, perWeek) - 1) * EXTRA_PER_WEEK;
}

/** 드레싱은 팩 크기와 무관하게 2봉 */
export const DRESSING_COUNT = 2;

export const DRESSINGS = ["참깨", "유자", "발사믹", "간장", "요거트"];

/** 다음 결제일 — 다음 달 1일 */
export function nextPaymentDate(from: Date = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

/**
 * 다음 픽업 회차들. 지점 수령 요일(주 1회는 화, 주 2회는 화·금)에 맞춰 만든다.
 */
export function upcomingPickups(perWeek: number, count: number, from: Date = new Date()): Date[] {
  const weekdays = perWeek >= 2 ? [2, 5] : [2]; // 화 · 금
  const out: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(17, 0, 0, 0);
  while (out.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    if (weekdays.includes(cursor.getDay())) out.push(new Date(cursor));
  }
  return out;
}

/** 매장에서 보여줄 확인번호 — 구독 id와 날짜로 정해져 재발급해도 같은 값이 나온다. */
export function pickupCode(subscriptionId: string, at: Date): string {
  const tail = subscriptionId.slice(-4).toUpperCase();
  const mmdd = `${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  let sum = 0;
  for (const ch of subscriptionId) sum = (sum * 31 + ch.charCodeAt(0)) % 1000;
  return `${tail}-${String(sum).padStart(3, "0")}-${mmdd}`;
}
