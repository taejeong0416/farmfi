import { NextRequest, NextResponse } from "next/server";
import { sweepReceipts, reconcileHoldings } from "@/lib/reconciliation";
import { drainIssuances } from "@/lib/chain-relay";

/**
 * GET /api/cron/reconcile?mode=receipts|full — 스케줄러가 부르는 대사 경로.
 *
 * `receipts`(10분 주기): 아웃박스를 한 번 드레인하고 미확정 영수증을 재조회한다.
 * `full`(하루 1회): 여기에 지갑별 건수 대조를 더한다.
 *
 * Vercel Cron은 요청에 `Authorization: Bearer $CRON_SECRET`을 실어 보낸다. 시크릿을
 * 설정하지 않았으면 외부에서 부를 수 없게 막는다 — 대사는 체인을 읽고 상태를
 * 바꾸므로 열린 경로로 두지 않는다.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET이 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") === "full" ? "full" : "receipts";

  const drained = await drainIssuances();
  const receipts = await sweepReceipts();
  const holdings = mode === "full" ? await reconcileHoldings() : null;

  return NextResponse.json({ mode, drained, receipts, holdings });
}
