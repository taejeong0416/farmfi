import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import {
  buildContractBody,
  getMyApplication,
  hashContract,
} from "@/lib/operator-apply";

/**
 * GET /api/operator/contract — 내 운영 계약 (O-07).
 *
 * 공간을 확정하면 계약서가 만들어진다. 아직 확정 전이면 계약이 없다고 답한다 —
 * 확정되지 않은 공간으로 계약서를 그리면 서명 대상이 흔들린다.
 *
 * 이미 만들어진 계약의 본문은 다시 만들지 않는다. 서명 전이라도 사용자가 읽고 있던
 * 문서가 요청할 때마다 바뀌면 안 된다.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const application = await getMyApplication(session.userId);
  if (!application) {
    return NextResponse.json({ contract: null, reason: "NO_APPLICATION" });
  }

  const existing = await prisma.operatorContract.findUnique({
    where: { applicationId: application.id },
  });
  if (existing) return NextResponse.json({ contract: existing });

  if (!application.confirmedAt) {
    return NextResponse.json({ contract: null, reason: "NOT_CONFIRMED" });
  }

  const [user, space] = await Promise.all([
    prisma.user.findUnique({
      where: { id: application.userId },
      select: { name: true },
    }),
    application.spaceId
      ? prisma.space.findUnique({
          where: { id: application.spaceId },
          select: { address: true },
        })
      : Promise.resolve(null),
  ]);

  const termStart = application.confirmedAt;
  const termEnd = new Date(termStart);
  termEnd.setFullYear(termStart.getFullYear() + 1);

  const body = buildContractBody({
    operatorName: user?.name ?? "운영자",
    region: application.region,
    spaceName: space?.address ?? null,
    termStart,
    termEnd,
  });

  const contract = await prisma.operatorContract.create({
    data: {
      applicationId: application.id,
      spaceId: application.spaceId,
      body,
      contentHash: hashContract(body),
      termStart,
      termEnd,
    },
  });

  return NextResponse.json({ contract });
}
