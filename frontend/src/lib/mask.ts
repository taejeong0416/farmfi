/**
 * 화면에 남의 개인정보를 그대로 띄우지 않기 위한 마스킹.
 * 운영자는 픽업 확인에 이름이 필요하지만 전체 이름까지는 필요 없다.
 */

/** 홍길동 → 홍*동 · 김철 → 김* · 외자면 그대로 */
export function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}
