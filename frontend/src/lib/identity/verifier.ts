import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * 신원 인증(실명 KYC) 추상화 레이어.
 *
 * 실제 백엔드는 자체 호스팅한 OpenDID Verifier(KOMSCO K-DID / OmniOne)이며,
 * 세 단계 흐름을 그대로 메서드로 매핑한다:
 *   1. createOffer  ≈ request-offer-qr  — 검증 정책으로 QR/딥링크 발급, txId 반환
 *   2. getStatus    ≈ 폴링             — 지갑이 VP 제출했는지 상태 확인
 *   3. getClaims    ≈ confirm-verify    — 검증 완료 시 클레임(실명/생년 등) 반환
 *
 * OpenDID Verifier가 아직 준비되지 않아 지금은 StubVerifier가 동작하고,
 * env `IDENTITY_PROVIDER === "opendid"`일 때만 실제 구현으로 교체된다.
 */
export type IdentityStatus = "pending" | "submitted" | "verified" | "failed";

export interface IdentityClaims {
  realName?: string;
  birthDate?: string; // ISO date (YYYY-MM-DD)
  adult?: boolean; // 만 18세 이상
  [k: string]: unknown;
}

export interface IdentityOffer {
  txId: string;
  qrData: string; // QR로 인코딩할 페이로드 (지갑 앱이 스캔)
  deeplink: string; // 모바일 지갑 앱 딥링크
}

export interface IdentityVerifier {
  /** ≈ request-offer-qr: 검증 정책(요청 클레임 목록)으로 인증 세션 생성. */
  createOffer(policy: { claims: string[] }): Promise<IdentityOffer>;
  /** 인증 세션 진행 상태 폴링. */
  getStatus(txId: string): Promise<IdentityStatus>;
  /** ≈ confirm-verify: 검증 완료된 클레임 반환(미완료면 null). */
  getClaims(txId: string): Promise<IdentityClaims | null>;
}

// ─────────────────────────────────────────────────────────────
// StubVerifier — OpenDID Verifier 준비 전 개발/시연용 스텁.
// createOffer가 IdentityVerification 행을 만들고, getStatus가
// 약 3초 뒤(또는 simulate=즉시) pending → verified로 자동 전이한다.
// ─────────────────────────────────────────────────────────────
const AUTO_VERIFY_MS = 3000;

// 만 25세 목업 생년월일 (오늘 기준 25년 전).
function mockBirthDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  return d.toISOString().slice(0, 10);
}

const MOCK_CLAIMS: IdentityClaims = {
  realName: "홍길동",
  birthDate: mockBirthDate(),
  adult: true,
};

export class StubVerifier implements IdentityVerifier {
  async createOffer(policy: { claims: string[] }): Promise<IdentityOffer> {
    const txId = `stub_${globalThis.crypto.randomUUID()}`;
    await prisma.identityVerification.create({
      data: { txId, status: "pending" },
    });
    const qrData = JSON.stringify({
      type: "openid-vp-offer",
      txId,
      claims: policy.claims,
      stub: true,
    });
    return {
      txId,
      qrData,
      // 실제 지갑 딥링크 스킴 자리표시자 — 실 구현 시 교체.
      deeplink: `omnione://verify?txId=${txId}`,
    };
  }

  async getStatus(txId: string): Promise<IdentityStatus> {
    const row = await prisma.identityVerification.findUnique({
      where: { txId },
    });
    if (!row) return "failed";
    if (row.status !== "pending") return row.status as IdentityStatus;

    // 생성 후 AUTO_VERIFY_MS 경과 시 verified 전이 (UI 폴링 루프용).
    const elapsed = Date.now() - row.createdAt.getTime();
    if (elapsed >= AUTO_VERIFY_MS) {
      const updated = await prisma.identityVerification.update({
        where: { txId },
        data: {
          status: "verified",
          claims: MOCK_CLAIMS as Prisma.InputJsonValue,
        },
      });
      return updated.status as IdentityStatus;
    }
    return "pending";
  }

  async getClaims(txId: string): Promise<IdentityClaims | null> {
    const row = await prisma.identityVerification.findUnique({
      where: { txId },
    });
    if (!row || row.status !== "verified") return null;
    return (row.claims as IdentityClaims | null) ?? MOCK_CLAIMS;
  }
}

// ─────────────────────────────────────────────────────────────
// TODO: OmniOneVerifier — Oracle 인스턴스의 did-verifier-server를 가리킨다.
// OpenDID Verifier(KOMSCO K-DID) REST API 연동:
//   createOffer → POST /api/v1/verify/request-offer-qr
//   getStatus   → GET  /api/v1/verify/status?txId=...
//   getClaims   → POST /api/v1/verify/confirm-verify
// 준비되면 아래 껍데기를 채우고 getVerifier() 분기를 활성화한다.
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// OmniOneVerifier — 오라클에 자체 호스팅한 OpenDID Verifier(8092) 실연동.
// createOffer는 실제 request-offer-qr를 호출해 지갑이 스캔할 VerifyOffer를
// 받아온다. 검증 완료(verified)는 사용자 지갑이 request-verify→confirm-verify를
// 제출할 때 일어나며, 폴링 전용 엔드포인트가 없어 로컬 IdentityVerification 행을
// 상태 소스로 쓴다(confirm-verify 콜백이 붙기 전까지 pending 유지).
// 연동 배경·엔드포인트: docs/opendid-verifier-연동.md
// ─────────────────────────────────────────────────────────────
// confirm-verify 응답 형태 (오라클 Verifier 소스 계약).
interface ConfirmVerifyClaim {
  caption?: string;
  code?: string;
  format?: string;
  hideValue?: boolean;
  type?: string;
  value?: unknown;
}
interface ConfirmVerifyResponse {
  vc?: string;
  issuer?: string;
  result?: boolean;
  claims?: ConfirmVerifyClaim[];
}

// prisma 스키마 변경을 피하려고 offerId를 IdentityVerification.claims(Json)에
// 임시 보관할 때 쓰는 예약 키. verified로 확정될 때 실 클레임으로 덮어쓴다.
const OFFER_ID_KEY = "_offerId";

// "19990203", "1999.02.03", "1999-02-03" 등 → "1999-02-03"으로 보정.
function normalizeBirthDate(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return raw;
}

// 생년월일 기준 만 나이 >= 18 여부.
function isAdultByBirthDate(birthDate?: string): boolean {
  if (!birthDate) return false;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const monthDiff = now.getMonth() - b.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < b.getDate())) {
    age -= 1;
  }
  return age >= 18;
}

// confirm-verify claims[]를 IdentityClaims로 매핑. 정확한 풀 코드가 달라도
// 접미사(endsWith)로 견고하게 잡는다. (예: org.farmfi.v1.identity.user_name)
function mapConfirmClaims(claims: ConfirmVerifyClaim[] | undefined): IdentityClaims {
  const out: IdentityClaims = {};
  for (const c of claims ?? []) {
    const code = typeof c.code === "string" ? c.code : "";
    const value = c.value == null ? "" : String(c.value);
    if (code.endsWith("user_name")) {
      out.realName = value;
    } else if (code.endsWith("birth_date")) {
      out.birthDate = normalizeBirthDate(value);
    }
  }
  if (out.birthDate) {
    out.adult = isAdultByBirthDate(out.birthDate);
  }
  return out;
}

// 로컬 행의 claims(Json)에 임시 보관한 offerId를 안전하게 꺼낸다.
function extractOfferId(claims: Prisma.JsonValue | null | undefined): string | null {
  if (claims && typeof claims === "object" && !Array.isArray(claims)) {
    const v = (claims as Record<string, unknown>)[OFFER_ID_KEY];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export class OmniOneVerifier implements IdentityVerifier {
  constructor(private readonly baseUrl: string) {}

  async createOffer(_policy: { claims: string[] }): Promise<IdentityOffer> {
    const policyId = process.env.IDENTITY_VERIFIER_POLICY_ID ?? "";
    if (!policyId) {
      throw new Error("IDENTITY_VERIFIER_POLICY_ID 미설정");
    }
    const res = await fetch(
      `${this.baseUrl}/verifier/api/v1/request-offer-qr`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId }),
      }
    );
    if (!res.ok) {
      throw new Error(`Verifier request-offer-qr 실패: ${res.status}`);
    }
    // { txId, payload: { offerId, type, mode, device, service, endpoints, validUntil, locked } }
    const data = (await res.json()) as {
      txId: string;
      payload: Record<string, unknown>;
    };

    // confirm-verify는 offerId로 검증 결과를 가져온다. 스키마 변경 없이 폴링에서
    // 재사용하려고 offerId를 claims(Json)에 임시 보관한다. verified 확정 시 덮어씀.
    const offerId =
      typeof data.payload?.offerId === "string" ? data.payload.offerId : "";

    // 세션 추적·상태 폴링용으로 로컬에 txId 기록.
    await prisma.identityVerification.create({
      data: {
        txId: data.txId,
        status: "pending",
        claims: { [OFFER_ID_KEY]: offerId } as Prisma.InputJsonValue,
      },
    });

    return {
      txId: data.txId,
      qrData: JSON.stringify(data.payload), // 지갑 앱이 스캔할 VerifyOffer
      deeplink: `omnione://verify?txId=${data.txId}`,
    };
  }

  async getStatus(txId: string): Promise<IdentityStatus> {
    const row = await prisma.identityVerification.findUnique({
      where: { txId },
    });
    if (!row) return "failed";
    // 이미 확정된 세션은 confirm-verify 재호출 없이 그대로 반환.
    if (row.status === "verified") return "verified";
    if (row.status !== "pending") return row.status as IdentityStatus;

    // pending이면 offerId로 confirm-verify를 물어본다. 지갑이 아직 VP를 제출하지
    // 않았으면 result=false거나 실패할 수 있으므로, 예외를 삼키고 pending 유지.
    const offerId = extractOfferId(row.claims);
    if (!offerId) return "pending";

    try {
      const res = await fetch(
        `${this.baseUrl}/verifier/api/v1/confirm-verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId }),
        }
      );
      if (!res.ok) return "pending";
      const data = (await res.json()) as ConfirmVerifyResponse;
      if (data.result !== true) return "pending";

      const mapped = mapConfirmClaims(data.claims);
      await prisma.identityVerification.update({
        where: { txId },
        data: { status: "verified", claims: mapped as Prisma.InputJsonValue },
      });
      return "verified";
    } catch {
      // fetch/파싱 실패 = 아직 미제출 등 → 폴링 지속. 라우트를 500 내지 않는다.
      return "pending";
    }
  }

  async getClaims(txId: string): Promise<IdentityClaims | null> {
    const row = await prisma.identityVerification.findUnique({
      where: { txId },
    });
    if (!row || row.status !== "verified") return null;
    const claims = row.claims as IdentityClaims | null;
    if (!claims) return null;
    // 임시 보관 키(_offerId)는 소비자에게 노출하지 않는다.
    const { [OFFER_ID_KEY]: _omit, ...rest } = claims as Record<string, unknown>;
    return rest as IdentityClaims;
  }
}

/**
 * 환경에 맞는 IdentityVerifier 구현을 반환하는 팩토리.
 * IDENTITY_PROVIDER === "opendid"일 때만 실제 OpenDID Verifier로 교체된다.
 */
export function getVerifier(): IdentityVerifier {
  if (process.env.IDENTITY_PROVIDER === "opendid") {
    const baseUrl = process.env.IDENTITY_VERIFIER_URL ?? "";
    return new OmniOneVerifier(baseUrl);
  }
  return new StubVerifier();
}
