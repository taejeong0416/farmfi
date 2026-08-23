// ── 운영자 보증서 ────────────────────────────────────────────────────────────
// 앱이 이 보증서를 검증해 운영 기능을 열고 닫는다(앱 M-02). 그래서 "지금 유효한가"의
// 판정이 한 곳에 있어야 한다 — 앱과 웹이 다른 답을 내면 운영자는 이유를 모른 채 막힌다.

export type CredentialStatus = "active" | "suspended" | "expired" | "revoked";

export const CREDENTIAL_STATUS_LABEL: Record<string, string> = {
  active: "유효",
  suspended: "정지",
  expired: "만료",
  revoked: "해지",
};

/** 정지·해지 사유 코드 (명세 17.1-8) */
export const SUSPEND_REASONS: Record<string, string> = {
  training_expired: "교육 이수 만료",
  safety_check_expired: "안전점검 만료",
  serious_violation: "중대 위반",
  contract_ended: "운영계약 종료",
  other: "기타",
};

export interface CredentialLike {
  status: string;
  expiresAt: Date;
  statusNote?: string | null;
  statusReason?: string | null;
}

export type CredentialCheck =
  | { valid: true; status: "active"; daysLeft: number }
  | { valid: false; status: CredentialStatus; reason: string; action: string };

/**
 * 지금 이 보증서로 운영 기능을 열어도 되는가.
 *
 * 만료는 시간이 지나면 자동이라 저장된 status가 아직 `active`여도 여기서 걸린다 —
 * 배치가 늦게 돌아도 사용자가 만료된 권한을 쓰지 못한다.
 *
 * 실패 사유마다 **다음 행동**을 함께 준다. 명세: "실패 화면에는 실패 이유와
 * 사용자가 취할 수 있는 다음 행동이 표시된다."
 */
export function checkCredential(c: CredentialLike, now: Date = new Date()): CredentialCheck {
  const expired = c.expiresAt.getTime() <= now.getTime();

  if (c.status === "revoked") {
    return {
      valid: false,
      status: "revoked",
      reason: c.statusNote ?? "보증서가 해지됐습니다.",
      action: "관리자에게 문의해 주세요.",
    };
  }
  if (c.status === "suspended") {
    return {
      valid: false,
      status: "suspended",
      reason: c.statusNote ?? SUSPEND_REASONS[c.statusReason ?? "other"] ?? "보증서가 정지됐습니다.",
      action: "정지 사유를 해소한 뒤 관리자에게 재개를 요청해 주세요.",
    };
  }
  if (expired || c.status === "expired") {
    return {
      valid: false,
      status: "expired",
      reason: "보증서 유효기간이 지났습니다.",
      action: "운영계약을 갱신하고 재발급을 요청해 주세요.",
    };
  }

  const daysLeft = Math.ceil((c.expiresAt.getTime() - now.getTime()) / 86_400_000);
  return { valid: true, status: "active", daysLeft };
}

/** `FF-2026-ABC123` — 사람이 전화로 부를 수 있어야 해서 짧고 대문자다. */
export function credentialNo(applicationId: string, at: Date = new Date()): string {
  return `FF-${at.getFullYear()}-${applicationId.slice(-6).toUpperCase()}`;
}
