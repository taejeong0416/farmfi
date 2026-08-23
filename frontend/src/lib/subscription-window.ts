// 구독 변경 마감 (명세 17.1-9)
//
// 두 마감이 서로 다른 것을 지킨다.
//
//   픽업 3시간 전  — 매장이 그 회차의 팩을 담기 시작하는 시점. 담은 뒤에 건너뛰면
//                    이미 만든 물건이 버려진다.
//   다음 결제일 전날 — 결제일 당일 해지는 그날 청구가 나간 뒤인지 전인지가 갈리고,
//                    "돈은 나갔는데 해지됐다"가 된다. 하루를 비워 그 겹침을 없앤다.
//
// 시각 비교를 화면과 서버가 각각 하면 언젠가 갈린다. 규칙은 여기 한 곳에 두고
// 서버가 판정하며, 화면은 서버가 내려준 마감 시각을 그리기만 한다.

/** 픽업 회차를 바꿀 수 있는 마감 — 픽업 시작 3시간 전 */
export const PICKUP_CHANGE_LEAD_HOURS = 3;

/** 해지 마감 — 다음 결제일 전날 끝 */
export const CANCEL_LEAD_DAYS = 1;

export type WindowCheck =
  | { ok: true }
  | { ok: false; code: string; error: string; deadline: string };

/** 그 회차를 바꿀 수 있는 마지막 시각. */
export function pickupChangeDeadline(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - PICKUP_CHANGE_LEAD_HOURS * 3_600_000);
}

/**
 * 해지 마감 — 다음 결제일 하루 전의 끝(23:59:59.999).
 * 결제일이 없으면 아직 청구가 잡히지 않은 구독이라 마감도 없다.
 */
export function cancelDeadline(nextPaymentAt: Date | null): Date | null {
  if (!nextPaymentAt) return null;
  const d = new Date(nextPaymentAt);
  d.setDate(d.getDate() - CANCEL_LEAD_DAYS);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** 이 회차를 지금 바꿀 수 있는가 (건너뛰기·주기 변경). */
export function canChangePickup(scheduledAt: Date, now: Date = new Date()): WindowCheck {
  const deadline = pickupChangeDeadline(scheduledAt);
  if (now <= deadline) return { ok: true };
  return {
    ok: false,
    code: "PICKUP_CHANGE_CLOSED",
    error: `픽업 ${PICKUP_CHANGE_LEAD_HOURS}시간 전까지만 변경할 수 있습니다. 매장이 이미 준비를 시작했습니다.`,
    deadline: deadline.toISOString(),
  };
}

/** 지금 해지할 수 있는가. */
export function canCancel(
  nextPaymentAt: Date | null,
  now: Date = new Date(),
): WindowCheck {
  const deadline = cancelDeadline(nextPaymentAt);
  if (!deadline || now <= deadline) return { ok: true };
  return {
    ok: false,
    code: "CANCEL_CLOSED",
    error:
      "다음 결제일 전날까지만 해지할 수 있습니다. 이번 회차까지 이용한 뒤 다음 주기에 해지됩니다.",
    deadline: deadline.toISOString(),
  };
}
