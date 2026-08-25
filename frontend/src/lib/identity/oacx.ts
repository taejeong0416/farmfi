import { createHash } from "node:crypto";

/**
 * OmniOne CX (라온시큐어) 모바일 신분증 연동 클라이언트.
 *
 * 해커톤 제공 테스트 환경 — 별도 신청 없이 기간 중 유지된다(주최측 확인).
 * 흐름: trans(토큰 발급) → authen 요청 → authen 결과 검증
 *      → trans/{token}(파싱, 개인정보 수령)
 *
 * ⚠️ 모든 호출은 서버에서만 한다. 결과 토큰이 브라우저에 노출되면 그 토큰으로
 * 누구나 개인정보를 파싱할 수 있다(파싱 API에 별도 인증이 없다).
 */

// OACX는 국내 IP만 통과시킨다. 미국·일본에서 부르면 연결 자체가 조용히 드롭된다
// (Vercel iad1 실측: connect timeout). 그래서 Vercel 함수 리전을 서울(icn1)로
// 두고 여기서 직접 부른다 — 프로젝트 설정 Functions → Region.
const BASE = process.env.OACX_BASE_URL ?? "https://cx.raonsecure.co.kr:18543";

// 운전면허증만 활성(status=y)이다. 주민등록증(comrc)은 현재 꺼져 있어
// 요청해도 실패하므로 기본값으로 두지 않는다.
export const OACX_PROVIDER = process.env.OACX_PROVIDER ?? "comdl_v1.5";

export type OacxTrans = { token: string; txId: string; oacxCode: string; resultCode: string };

export type OacxRequestResult = {
  token: string;
  cxId: string;
  oacxStatus: string;
  data?: { qrBase64?: string; androidLink?: string; iosLink?: string; ssPayLink?: string; m200?: string };
};

// trans/{token} 파싱 응답. 신분증 종류에 따라 필드가 달라 전부 optional.
export type OacxIdentity = {
  name?: string;
  birth?: string;      // YYYYMMDD
  ci?: string;
  telno?: string;
  address?: string;
  sex?: string;
  provider?: string;
  vcTypeCode?: string;
  userDid?: string;
  resultCode?: string;
  clientMessage?: string;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`OACX 응답을 해석하지 못했습니다 (${res.status})`);
  }
  if (!res.ok) {
    const msg = (body as { clientMessage?: string } | null)?.clientMessage;
    throw new Error(msg ?? `OACX 요청 실패 (${res.status})`);
  }
  return body as T;
}

/** 1단계 — 거래 토큰 발급. JWT 유효기간 5분. */
export function createTrans(): Promise<OacxTrans> {
  return call<OacxTrans>("/oacx/api/v1.0/trans", { method: "POST" });
}

/**
 * 2단계 — 제출 요청.
 * mode="qr"  : QR 이미지(base64) 반환 — PC 웹에서 폰으로 스캔
 * mode="app" : 딥링크 반환 — 모바일에서 신분증 앱 직접 호출
 *
 * zkpType 을 주면 영지식 모드로 동작해 원본 값 대신 판정만 받는다.
 * AdultVerify(성인여부) / GenderVerify(성별). 생년월일을 안 받고도
 * 성인 여부를 확인할 수 있어, 받을 수 있는 걸 안 받는 설계가 가능하다.
 */
export function requestSubmission(opts: {
  token: string;
  txId: string;
  mode: "qr" | "app";
  requestType?: "WEB2APP" | "APP2APP";
  zkpType?: "AdultVerify" | "GenderVerify";
}): Promise<OacxRequestResult> {
  const path = opts.mode === "qr" ? "/oacx/api/v1.0/authen/qr/request" : "/oacx/api/v1.0/authen/app/request";
  const body: Record<string, unknown> = {
    provider: OACX_PROVIDER,
    token: opts.token,
    txId: opts.txId,
    contentInfo: {
      signType: "ENT_MID",
      ...(opts.mode === "app" && opts.requestType ? { requestType: opts.requestType } : {}),
    },
    ...(opts.zkpType ? { extraParams: { zkpType: opts.zkpType } } : {}),
  };
  return call<OacxRequestResult>(path, { method: "POST", body: JSON.stringify(body) });
}

/** 3단계 — 검증 요청. 사용자가 제출을 마쳐야 성공한다. */
export function fetchResult(opts: {
  token: string;
  txId: string;
  cxId: string;
  mode: "qr" | "app";
  requestType?: "WEB2APP" | "APP2APP";
}): Promise<{ token: string; oacxCode: string; clientMessage?: string }> {
  const path = opts.mode === "qr" ? "/oacx/api/v1.0/authen/qr/result" : "/oacx/api/v1.0/authen/app/result";
  return call(path, {
    method: "POST",
    body: JSON.stringify({
      provider: OACX_PROVIDER,
      token: opts.token,
      txId: opts.txId,
      cxId: opts.cxId,
      contentInfo: {
        signType: "ENT_MID",
        ...(opts.requestType ? { requestType: opts.requestType } : {}),
      },
    }),
  });
}

/** 4단계 — 토큰 파싱. 여기서만 개인정보가 나온다. */
export async function parseToken(token: string): Promise<OacxIdentity> {
  const body = await call<{ data?: OacxIdentity } & OacxIdentity>(
    `/oacx/api/v1.0/trans/${encodeURIComponent(token)}`,
    { method: "GET" }
  );
  return body.data ?? body;
}

/**
 * CI → 저장용 해시.
 * CI 는 전 서비스 공통 식별자라 원문을 보관하면 유출 시 타 서비스 계정까지
 * 연결된다. 중복가입 판별에는 동일성만 필요하므로 서버 시크릿을 섞어 해시한다.
 * 시크릿이 없으면 던진다 — 시크릿 없는 해시는 무지개표 한 방이다.
 */
export function hashCi(ci: string): string {
  const secret = process.env.IDENTITY_CI_SALT;
  if (!secret) throw new Error("IDENTITY_CI_SALT 가 설정되지 않았습니다.");
  return createHash("sha256").update(`${secret}:${ci}`).digest("hex");
}

/** YYYYMMDD → 만 나이. 생년월일을 저장하지 않고 성인 여부만 남기기 위해 쓴다. */
export function ageFromBirth(birth: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(birth.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const b = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const before = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (before) age -= 1;
  return age;
}
