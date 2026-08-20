import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTrans, requestSubmission } from "@/lib/identity/oacx";

// POST /api/identity/oacx/start  { mode: "qr" | "app", requestType?, zkp?: boolean }
// 모바일 신분증 제출 요청을 시작한다.
//
// OACX 토큰은 클라이언트에 내리지 않는다. 파싱 API 에 별도 인증이 없어서
// 토큰만 있으면 누구나 개인정보를 꺼낼 수 있다. 세션 행에 보관하고
// 클라이언트에는 우리 txId 만 준다.
export async function POST(req: NextRequest) {
  const session = await getServerSession();

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const mode = b.mode === "app" ? "app" : "qr";
  const requestType = b.requestType === "APP2APP" ? "APP2APP" : "WEB2APP";
  // 성인 여부만 필요할 때는 생년월일을 아예 받지 않는다.
  const zkpType = b.zkp === true ? ("AdultVerify" as const) : undefined;

  try {
    const trans = await createTrans();
    const reqRes = await requestSubmission({
      token: trans.token,
      txId: trans.txId,
      mode,
      requestType: mode === "app" ? requestType : undefined,
      zkpType,
    });

    await prisma.identityVerification.create({
      data: {
        userId: session?.userId ?? null,
        txId: trans.txId,
        status: "pending",
        // OACX 세션 값은 서버 전용. claims 는 검증 완료 시 실제 클레임으로 덮어쓴다.
        claims: {
          provider: "oacx",
          mode,
          requestType: mode === "app" ? requestType : null,
          zkp: !!zkpType,
          oacxToken: reqRes.token,
          cxId: reqRes.cxId,
        },
      },
    });

    return NextResponse.json({
      txId: trans.txId,
      mode,
      // 화면이 그릴 것만 내린다 — QR 이미지 또는 딥링크.
      qrBase64: reqRes.data?.qrBase64 ?? null,
      androidLink: reqRes.data?.androidLink ?? null,
      iosLink: reqRes.data?.iosLink ?? null,
      ssPayLink: reqRes.data?.ssPayLink ?? null,
      expiresInSec: 300, // OACX JWT 유효기간
    });
  } catch (e) {
    console.error("POST /api/identity/oacx/start error:", e);
    const msg = e instanceof Error ? e.message : "인증 요청에 실패했습니다.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
