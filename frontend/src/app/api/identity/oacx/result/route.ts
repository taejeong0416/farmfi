import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ageFromBirth, fetchResult, hashCi, parseToken } from "@/lib/identity/oacx";

// POST /api/identity/oacx/result  { txId }
// 사용자가 신분증 앱에서 제출을 마친 뒤 호출한다. 검증 → 파싱 → 저장.
//
// 저장 원칙: 실명확인에 필요한 최소치만 남긴다.
//   저장함  — 실명, 성인 여부, CI 해시(중복가입 판별), 인증 시각
//   버림    — CI 원문, 주민등록번호, 주소, 전화번호, 생년월일 원본
// OACX 는 요청하면 이 값들을 다 주지만, 받는 것과 보관하는 것은 다른 문제다.
export async function POST(req: NextRequest) {
  const session = await getServerSession();

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const txId = (body as { txId?: unknown } | null)?.txId;
  if (typeof txId !== "string" || !txId) {
    return NextResponse.json({ error: "txId가 필요합니다." }, { status: 400 });
  }

  const row = await prisma.identityVerification.findUnique({ where: { txId } });
  if (!row) {
    return NextResponse.json({ error: "인증 세션을 찾을 수 없습니다." }, { status: 404 });
  }
  // 다른 사용자의 세션으로 내 계정을 인증시킬 수 없게 막는다.
  if (row.userId && session?.userId && row.userId !== session.userId) {
    return NextResponse.json({ error: "세션이 일치하지 않습니다." }, { status: 403 });
  }
  if (row.status === "verified") {
    return NextResponse.json({ status: "verified", alreadyVerified: true });
  }

  const meta = (row.claims ?? {}) as Record<string, unknown>;
  const oacxToken = typeof meta.oacxToken === "string" ? meta.oacxToken : "";
  const cxId = typeof meta.cxId === "string" ? meta.cxId : "";
  const mode = meta.mode === "app" ? "app" : "qr";
  const requestType = meta.requestType === "APP2APP" ? "APP2APP" : undefined;
  if (!oacxToken || !cxId) {
    return NextResponse.json({ error: "인증 세션이 손상됐습니다." }, { status: 409 });
  }

  try {
    const verified = await fetchResult({
      token: oacxToken,
      txId,
      cxId,
      mode: mode as "qr" | "app",
      requestType,
    });

    if (verified.oacxCode !== "OACX_SUCCESS") {
      await prisma.identityVerification.update({
        where: { txId },
        data: { status: "pending" },   // 아직 제출 전일 수 있다 — 실패로 굳히지 않는다
      });
      return NextResponse.json(
        { status: "pending", message: verified.clientMessage ?? "아직 제출이 완료되지 않았습니다." },
        { status: 202 }
      );
    }

    const identity = await parseToken(verified.token);
    const realName = identity.name?.trim() || null;
    const ci = identity.ci?.trim() || null;
    const age = identity.birth ? ageFromBirth(identity.birth) : null;
    const adult = age === null ? null : age >= 19;

    if (!ci) {
      await prisma.identityVerification.update({ where: { txId }, data: { status: "failed" } });
      return NextResponse.json({ error: "실명확인 식별자(CI)를 받지 못했습니다." }, { status: 502 });
    }
    const ciHash = hashCi(ci);

    // 중복가입 차단 — 같은 CI 가 다른 계정에 이미 붙어 있으면 거절한다.
    if (session?.userId) {
      const taken = await prisma.user.findFirst({
        where: { ciHash, NOT: { id: session.userId } },
        select: { id: true },
      });
      if (taken) {
        await prisma.identityVerification.update({ where: { txId }, data: { status: "failed" } });
        return NextResponse.json(
          { error: "이미 다른 계정에서 인증된 신분증입니다." },
          { status: 409 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.identityVerification.update({
        where: { txId },
        data: {
          status: "verified",
          // 원본이 아니라 판정만 남긴다.
          claims: { provider: "oacx", realName, adult, vcType: identity.vcTypeCode ?? null },
        },
      });
      if (session?.userId) {
        await tx.user.update({
          where: { id: session.userId },
          data: {
            identityVerified: true,
            verifiedAt: new Date(),
            realName,
            ciHash,
            identityProvider: "oacx",
          },
        });
      }
    });

    return NextResponse.json({ status: "verified", realName, adult });
  } catch (e) {
    console.error("POST /api/identity/oacx/result error:", e);
    return NextResponse.json({ error: "인증 결과 확인에 실패했습니다." }, { status: 502 });
  }
}
