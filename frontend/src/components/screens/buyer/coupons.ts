/**
 * 구독 쿠폰 목록. 주문 화면(고르는 곳)과 완료·관리 화면(적용된 것을 보여주는 곳)이
 * 같은 정의를 써야 코드만 남고 이름이 사라지는 일이 없다.
 */
export const COUPONS = [
  {
    code: "FIRST5000",
    title: "첫 구독 5,000원 할인",
    desc: "20,000원 이상 · 오늘까지",
    discount: 5_000,
    recommended: true,
  },
  {
    code: "FRIEND3000",
    title: "픽업 친구 추천 3,000원",
    desc: "15,000원 이상 · 이번 달까지",
    discount: 3_000,
  },
  {
    code: "DRESSING",
    title: "드레싱 2봉 무료",
    desc: "다음 2회차까지",
    discount: 2_000,
  },
];

/** 저장된 코드로 쿠폰을 찾는다. 목록에 없는 코드(직접 입력분)는 null. */
export function findCoupon(code: string | null | undefined) {
  if (!code) return null;
  return COUPONS.find((c) => c.code === code) ?? null;
}

/** 적용된 쿠폰을 한 줄로 적는다. 목록에 없는 코드는 코드 자체를 보여준다. */
export function couponLabel(code: string | null | undefined, discount: number) {
  if (!code) return null;
  const found = findCoupon(code);
  const name = found?.title ?? code;
  return discount > 0 ? `${name} (−${discount.toLocaleString()}원)` : name;
}
