import { NextRequest, NextResponse } from "next/server";
import { getVerifier } from "@/lib/identity/verifier";
import { evaluate } from "@/lib/identity/investor-limit";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}

/**
 * 클레임의 생년월일을 DB(Date)에 넣어도 되는 값인지 검증한다.
 * Invalid Date거나 1900년 이전/미래면 저장하지 않는다 — 파싱 오류로 만들어진
 * 값(예: 주민번호 앞자리 오해석)이 나이 기반 분기를 오염시키지 않게.
 */
function parseBirthDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 1900) return null;
  if (d.getTime() > Date.now()) return null;
  return d;
}

/**
 * GET /api/identity/status?txId=...
 * 인증 세션 상태를 폴링한다. verified가 되면 클레임을 조회해
 * 투자자 적격/한도(evaluate)를 계산하고, 로그인된 세션 사용자에 한해
 * User.identityVerified/realName/investorAnnualLimit 등을 서버에서 직접 반영한다.
 * user_id는 반드시 서버 세션(JWT)에서만 가져온다 — 클라이언트 값은 절대 신뢰하지 않는다.
 */
export async function GET(request: NextRequest) {
  const txId = new URL(request.url).searchParams.get("txId");
  if (!txId) {
    return NextResponse.json({ error: "txId is required" }, { status: 400 });
  }

  try {
    const verifier = getVerifier();
    const status = await verifier.getStatus(txId);

    if (status !== "verified") {
      return NextResponse.json({ status });
    }

    const claims = await verifier.getClaims(txId);
    const eligibility = evaluate(claims);

    const session = await getServerSession();
    if (session) {
      // txId 소유자 확인 — 다른 유저에게 연결된 인증 세션(txId)으로는 내 계정을
      // 인증 완료 처리할 수 없다. userId가 비어 있으면(로그인 전 발급) 현재
      // 세션 유저의 것으로 귀속시킨다.
      const record = await prisma.identityVerification.findUnique({
        where: { txId },
      });
      const ownsTx =
        !!record && (record.userId === null || record.userId === session.userId);

      if (ownsTx) {
        try {
          if (record.userId === null) {
            await prisma.identityVerification.update({
              where: { txId },
              data: { userId: session.userId },
            });
          }

          // 인증 세션은 verified라도 투자 적격(실명·성인) 요건을 만족해야
          // identityVerified로 승격한다. 부적격을 verified로 굳히면 재인증
          // 경로가 막혀 영구 청약 불가가 된다.
          const birthDate = parseBirthDate(claims?.birthDate);
          await prisma.user.update({
            where: { id: session.userId },
            data: {
              ...(eligibility.eligible
                ? { identityVerified: true, verifiedAt: new Date() }
                : {}),
              ...(claims?.realName ? { realName: String(claims.realName) } : {}),
              ...(birthDate ? { birthDate } : {}),
              investorAnnualLimit: eligibility.annualLimit,
            },
          });
        } catch (persistError) {
          // 화면은 "인증 완료"인데 DB는 미인증인 분기를 만들지 않는다 — 500으로 실패시킨다.
          console.error("GET /api/identity/status: failed to persist verified user:", persistError);
          return NextResponse.json(
            { error: "인증 결과 저장에 실패했습니다. 다시 시도해주세요." },
            { status: 500 },
          );
        }
      }
    }

    return NextResponse.json(
      serializeBigInt({
        status,
        claims,
        eligibility: {
          eligible: eligibility.eligible,
          annualLimit: eligibility.annualLimit,
          reasons: eligibility.reasons,
        },
      }),
    );
  } catch (error) {
    console.error("GET /api/identity/status error:", error);
    return NextResponse.json(
      { error: "인증 상태 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
