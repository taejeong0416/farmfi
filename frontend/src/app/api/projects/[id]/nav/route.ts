import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { calculateNAV } from "@/lib/nav-calculator";

/**
 * GET /api/projects/[id]/nav — 지점 기준가(NAV) 조회 (명세 2.3).
 *
 * **청약도 집행도 0건이면 값을 내지 않는다.** 산식이 0을 돌려주긴 하지만 그 0은
 * "가치가 0"이 아니라 "아직 잴 것이 없다"는 뜻이고, 화면에 0원으로 찍히면
 * 투자자가 손실로 읽는다. `available: false`로 내려 화면이 항목 자체를 감춘다.
 *
 * 산식의 입력은 신탁 잔액 · 집행으로 생긴 자산 · 누적 회수금이다(lib/nav-calculator).
 * 여기서는 그 값을 계산만 하고 `NavSnapshot`을 남기지 않는다 — 조회가 기록을
 * 만들면 누가 열어봤는지에 따라 변동률 기준선이 달라진다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 지점 기준가는 투자 판단에 쓰이는 값이라 로그인 뒤에만 연다.
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, totalTokens: true, tokenPrice: true },
  });
  if (!project) {
    return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
  }

  // 청약 = 발행된 보유 구좌, 집행 = 완료된 마일스톤. 둘 다 0이면 기준가가 설 자리가 없다.
  const [holdingCount, executedCount] = await Promise.all([
    prisma.tokenHolding.count({ where: { projectId: id } }),
    prisma.milestone.count({ where: { projectId: id, status: "completed" } }),
  ]);

  const basis = { holdings: holdingCount, executedMilestones: executedCount };

  if (holdingCount === 0 && executedCount === 0) {
    return NextResponse.json({
      project: { id: project.id, name: project.name },
      available: false,
      reason: "청약과 집행이 아직 없어 기준가를 내지 않습니다.",
      basis,
    });
  }

  // 구좌 수가 0이면 1구좌당 값을 나눌 수 없다. 산식이 0을 주므로 여기서 막는다.
  if ((project.totalTokens ?? 0) <= 0) {
    return NextResponse.json({
      project: { id: project.id, name: project.name },
      available: false,
      reason: "발행 구좌 수가 정해지지 않아 1구좌당 기준가를 낼 수 없습니다.",
      basis,
    });
  }

  const nav = await calculateNAV(id);

  return NextResponse.json({
    project: { id: project.id, name: project.name },
    available: true,
    basis,
    nav: nav.nav,
    previousNav: nav.previousNav,
    changeRate: nav.changeRate,
    breakdown: nav.breakdown,
    // 발행가 대비. 기준가만 보면 오르내림은 알아도 원금 대비 위치를 알 수 없다.
    issuePrice: Number(project.tokenPrice ?? 0),
  });
}
