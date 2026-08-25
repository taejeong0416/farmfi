/**
 * Open DID Issuer 연동 — 운영자 보증서를 VC로 발급한다.
 *
 * 라온시큐어 피드백에 따라 보증서 발급 경로에 Open DID를 쓴다. 오라클에
 * 자체 호스팅한 Issuer(8091)에 VC Plan(`farmfi-identity-plan`)이 등록돼 있고,
 * `request-offer`가 발급 오퍼를 만들어 준다.
 *
 * **오퍼는 VC가 아니다.** 운영자가 DID 지갑으로 그 오퍼를 스캔해 수령해야
 * 비로소 VC가 생긴다. 그래서 오퍼를 받아도 `vcId`는 null로 둔다 — 없는 VC를
 * 있는 척하지 않는다. 화면도 `verifiedBy: "number"`를 계속 내려준다.
 *
 * 실패해도 보증서 발급을 막지 않는다. 번호 기반 검증이 이미 성립하므로,
 * Issuer가 죽었다고 운영자가 매장에 못 들어가는 건 과한 결합이다.
 */

const ISSUER_BASE = (process.env.OPENDID_ISSUER_URL ?? "").trim().replace(/\/+$/, "");
const VC_PLAN_ID = process.env.OPENDID_VC_PLAN_ID ?? "farmfi-identity-plan";

export type IssueOffer = {
  offerId: string;
  vcPlanId: string;
  issuer: string;
  validUntil: string;
};

export function isOpenDidIssuerEnabled(): boolean {
  return ISSUER_BASE.length > 0;
}

export function openDidIssuerStatus(): { enabled: boolean; vcPlanId: string; base: string } {
  return { enabled: isOpenDidIssuerEnabled(), vcPlanId: VC_PLAN_ID, base: ISSUER_BASE };
}

/**
 * 발급 오퍼를 만든다. 실패하면 null — 호출부는 보증서 발급을 그대로 진행한다.
 */
export async function requestIssueOffer(): Promise<IssueOffer | null> {
  if (!isOpenDidIssuerEnabled()) return null;
  try {
    const res = await fetch(`${ISSUER_BASE}/issuer/api/v1/request-offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vcPlanId: VC_PLAN_ID }),
      cache: "no-store",
      // Issuer가 느려도 보증서 발급 화면을 붙잡아 두지 않는다.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("OpenDID request-offer 실패:", res.status);
      return null;
    }
    const body = (await res.json()) as {
      issueOfferPayload?: IssueOffer;
      code?: string;
      description?: string;
    };
    if (!body.issueOfferPayload?.offerId) {
      // Issuer는 실패도 200으로 주고 code/description을 싣는다.
      console.error("OpenDID request-offer 거절:", body.code, body.description);
      return null;
    }
    return body.issueOfferPayload;
  } catch (e) {
    console.error("OpenDID request-offer 오류:", e);
    return null;
  }
}

/** 지갑이 스캔할 오퍼 문자열. CA 앱이 읽는 payload 그대로다. */
export function offerPayloadFor(offer: IssueOffer): string {
  return JSON.stringify({
    offerId: offer.offerId,
    type: "IssueOffer",
    vcPlanId: offer.vcPlanId,
    issuer: offer.issuer,
    validUntil: offer.validUntil,
  });
}
