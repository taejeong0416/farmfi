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

/**
 * 매장에서 보여줄 확인번호 — `구독뒤4-검증3-MMDD`.
 *
 * 운영자가 스캔 실패 시 손으로 치는 값이라 짧고 읽기 쉬워야 하고, `code`에
 * unique가 걸려 있으므로 충돌하면 안 된다. 구독 id + 날짜만으로 만들면
 * 뒤 4자와 해시가 같은 두 구독이 같은 날 겹칠 수 있어, `attempt`로 값을 흔든다.
 * 0번째 시도는 예전과 같은 값이 나온다(기존 데이터와 형태 유지).
 */
export function pickupCode(subscriptionId: string, at: Date, attempt = 0): string {
  const tail = subscriptionId.slice(-4).toUpperCase();
  const mmdd = `${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  let sum = 0;
  for (const ch of subscriptionId) sum = (sum * 31 + ch.charCodeAt(0)) % 1000;
  // 시도마다 겹치지 않는 구간으로 밀어 두 번째 후보가 다시 부딪힐 확률을 줄인다.
  const shifted = (sum + attempt * 137) % 1000;
  return `${tail}-${String(shifted).padStart(3, "0")}-${mmdd}`;
}

const CODE_ATTEMPTS = 12;

/**
 * 회차를 만든다. 확인번호가 겹치면 다음 후보로 넘어간다.
 *
 * `createMany`를 쓰지 않는다 — 4건 중 하나가 충돌하면 전부 실패해서 구독 생성이
 * 통째로 깨진다. 한 건씩 넣고 그 건만 다시 시도한다.
 */
export async function createPickupOrders(
  client: { pickupOrder: { create: (args: { data: { subscriptionId: string; scheduledAt: Date; code: string } }) => Promise<unknown> } },
  subscriptionId: string,
  dates: Date[],
): Promise<void> {
  for (const at of dates) {
    let placed = false;
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      try {
        await client.pickupOrder.create({
          data: { subscriptionId, scheduledAt: at, code: pickupCode(subscriptionId, at, attempt) },
        });
        placed = true;
        break;
      } catch (e) {
        // unique 위반만 다시 시도한다. 다른 오류는 그대로 올린다.
        const code = (e as { code?: string } | null)?.code;
        if (code !== "P2002") throw e;
      }
    }
    if (!placed) {
      throw new Error("픽업 확인번호를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }
}
