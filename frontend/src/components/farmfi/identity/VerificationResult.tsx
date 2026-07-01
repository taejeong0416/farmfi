"use client";

import { formatKRW } from "@/lib/format";
import type { IdentityClaims, IdentityEligibility } from "./types";

/**
 * 검증 완료 후 실명·연령·투자한도 판별 결과 + 인증완료 배지.
 * "탈락 가능 조건"은 긍정 프레이밍으로 보여준다 — 부족한 항목도
 * "확인하면 한도가 늘어나요" 톤으로 안내하고, 근거(reasons)는 그대로 노출한다.
 */
export function VerificationResult({
  claims,
  eligibility,
}: {
  claims: IdentityClaims | null | undefined;
  eligibility: IdentityEligibility;
}) {
  return (
    <article className="card report-card">
      <span
        className="badge"
        style={{ background: eligibility.eligible ? "var(--green-800)" : "#e8a33d" }}
      >
        {eligibility.eligible ? "✓ 인증 완료" : "확인이 더 필요해요"}
      </span>

      <div className="kv" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div>
          <b>{claims?.realName ?? "-"}</b>
          <span>실명</span>
        </div>
        <div>
          <b>{claims?.adult ? "성인 확인" : "확인 필요"}</b>
          <span>연령 확인</span>
        </div>
        <div>
          <b>{eligibility.eligible ? formatKRW(eligibility.annualLimit) : "0원"}</b>
          <span>연간 투자 한도</span>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 18, fontSize: 13, fontWeight: 700 }}>
        {eligibility.eligible
          ? "실명·연령 확인이 끝나 투자 한도가 적용됐어요."
          : "아래 항목을 확인하면 투자 한도가 열려요."}
      </p>
      <ul style={{ marginTop: 8, paddingLeft: 18 }}>
        {eligibility.reasons.map((reason) => (
          <li key={reason} className="muted" style={{ marginTop: 4 }}>
            {reason}
          </li>
        ))}
      </ul>
    </article>
  );
}
