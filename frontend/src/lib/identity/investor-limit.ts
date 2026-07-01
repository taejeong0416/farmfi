import type { IdentityClaims } from "@/lib/identity/verifier";

/**
 * 자본시장법 기반 적격/일반 투자자 판정 및 연간 투자한도 룰엔진 (스켈레톤).
 *
 * ⚠️ 아래 한도 수치는 placeholder다. 실제 값은 자본시장법 및
 * 온라인소액투자중개(크라우드펀딩) 시행령의 투자자별 한도를 따라야 한다.
 * (예: 일반투자자는 연간·기업별 한도가 별도로 규정됨.)
 * 실 서비스 전 법무 검토 후 상수를 확정한다.
 */

// placeholder — 일반투자자 기본 연간 한도 (2,000만원). tsconfig target es2017 → BigInt() 사용.
const GENERAL_INVESTOR_ANNUAL_LIMIT = BigInt(20_000_000);
const NO_LIMIT = BigInt(0);
const MIN_INVEST_AGE = 18; // 만 18세 이상만 투자 가능.

export interface InvestorEligibility {
  eligible: boolean;
  annualLimit: bigint; // 원 단위. 부적격이면 0n.
  reasons: string[]; // 판정 근거 (긍정/제약 사유).
}

/** ISO 생년월일 문자열로 만 나이 계산. 유효하지 않으면 null. */
function calcAge(birthDate?: string): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const monthDiff = now.getMonth() - b.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < b.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * 검증된 신원 클레임으로 투자 적격 여부와 연간 한도를 산출한다.
 * 규칙:
 *   - 실명(realName) 필수 → 없으면 부적격.
 *   - 만 18세 이상 필수 → 미성년/생년 불명이면 부적격.
 *   - 통과 시 일반투자자 기본 연간 한도 부여 (placeholder).
 */
export function evaluate(claims: IdentityClaims | null): InvestorEligibility {
  const reasons: string[] = [];

  if (!claims) {
    return {
      eligible: false,
      annualLimit: NO_LIMIT,
      reasons: ["신원 인증이 완료되지 않았습니다."],
    };
  }

  const hasRealName = Boolean(claims.realName && String(claims.realName).trim());
  if (!hasRealName) {
    reasons.push("실명 인증 정보가 없습니다.");
  }

  const age = calcAge(claims.birthDate);
  const isAdult =
    claims.adult === true || (age !== null && age >= MIN_INVEST_AGE);
  if (!isAdult) {
    reasons.push(
      age === null
        ? "생년월일 확인이 필요합니다."
        : `만 ${MIN_INVEST_AGE}세 이상만 투자할 수 있습니다.`,
    );
  }

  const eligible = hasRealName && isAdult;
  if (eligible) {
    reasons.push("실명·연령 요건을 충족하여 일반투자자로 투자할 수 있습니다.");
    return {
      eligible: true,
      annualLimit: GENERAL_INVESTOR_ANNUAL_LIMIT,
      reasons,
    };
  }

  return { eligible: false, annualLimit: NO_LIMIT, reasons };
}
