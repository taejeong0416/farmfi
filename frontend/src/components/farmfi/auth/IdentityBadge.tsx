import Link from "next/link";
import { formatDate } from "@/lib/format";

/**
 * 본인인증 상태 배지. 미인증 상태를 "실패/제한"이 아니라 "인증하면 혜택이
 * 늘어난다"는 긍정 프레이밍으로 안내해 이탈보다 다음 행동을 유도한다.
 */
export function IdentityBadge({
  identityVerified,
  verifiedAt,
}: {
  identityVerified: boolean;
  verifiedAt: string | null;
}) {
  if (identityVerified) {
    return (
      <div className="field-stack">
        <span className="badge is-ok">✓ 본인인증 완료</span>
        {verifiedAt && <p className="muted">{formatDate(verifiedAt)} 인증됨</p>}
      </div>
    );
  }

  return (
    <div className="field-stack">
      <span className="badge is-pending">본인인증 전</span>
      <p className="muted">지금 인증하면 투자 한도가 열리고 이용 혜택이 늘어나요.</p>
      <Link className="link" href="/verify-identity" style={{ marginTop: 0 }}>
        본인인증 하러 가기 →
      </Link>
    </div>
  );
}
