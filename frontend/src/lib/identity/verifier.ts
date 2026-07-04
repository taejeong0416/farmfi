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
export class OmniOneVerifier implements IdentityVerifier {
  constructor(private readonly baseUrl: string) {}

  async createOffer(_policy: { claims: string[] }): Promise<IdentityOffer> {
    throw new Error("OmniOneVerifier not implemented yet");
  }
  async getStatus(_txId: string): Promise<IdentityStatus> {
    throw new Error("OmniOneVerifier not implemented yet");
  }
  async getClaims(_txId: string): Promise<IdentityClaims | null> {
    throw new Error("OmniOneVerifier not implemented yet");
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
