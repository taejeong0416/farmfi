import { NextRequest, NextResponse } from "next/server";
import { reconcileIssuances } from "@/lib/reconcile";

/**
 * POST · GET /api/cron/reconcile — 스케줄러가 부르는 대사 엔드포인트.
 *
 * 관리자 세션이 아니라 `CRON_SECRET`으로 연다. Vercel Cron은 `Authorization:
 * Bearer <CRON_SECRET>`를 붙여 GET으로 부른다.
 *
 * 시크릿이 설정돼 있지 않으면 **거부한다.** 열어 두면 아무나 체인 전송을
 * 유발할 수 있고, 그건 가스를 태우는 무료 버튼이 된다.
 */
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET이 설정되지 않아 대사 엔드포인트가 닫혀 있습니다." },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await reconcileIssuances();
  // 불일치는 운영 알림으로도 남긴다 — 크론 로그를 아무도 안 보기 때문이다.
  if (report.mismatches.length > 0) {
    await prismaNotify(report.mismatches.length, report.note);
  }
  return NextResponse.json(report);
}

async function prismaNotify(count: number, note: string) {
  const { prisma } = await import("@/lib/db");
  await prisma.notification
    .create({
      data: {
        type: "RECONCILE_MISMATCH",
        message: `발행 대사 불일치 ${count}건 — ${note}`,
      },
    })
    .catch(() => undefined);
}

export const GET = run;
export const POST = run;
