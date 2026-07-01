// 클라이언트 전용 타입. `@/lib/identity/*`는 서버 전용(prisma) 모듈을 임포트하므로
// 브라우저 번들에 섞이지 않도록 여기서 형태만 얕게 복제한다.

export type IdentityStatus = "pending" | "submitted" | "verified" | "failed";

export interface IdentityOffer {
  txId: string;
  qrData: string;
  deeplink: string;
}

export interface IdentityClaims {
  realName?: string;
  birthDate?: string;
  adult?: boolean;
  [k: string]: unknown;
}

export interface IdentityEligibility {
  eligible: boolean;
  annualLimit: number;
  reasons: string[];
}

export interface IdentityStatusResponse {
  status: IdentityStatus;
  claims?: IdentityClaims | null;
  eligibility?: IdentityEligibility;
}
