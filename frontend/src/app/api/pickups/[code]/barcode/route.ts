import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

/**
 * GET /api/pickups/[code]/barcode — 픽업 바코드 발급 (B-09).
 *
 * 같은 회차는 몇 번을 열어도 같은 바코드가 나온다. 화면을 저장해 뒀다가 매장에서
 * 보여주는 흐름이라(명세 B-09), 다시 열 때마다 값이 바뀌면 저장해 둔 이미지가
 * 무효가 된다.
 *
 * 이미 수령한 회차에는 발급하지 않는다. 발급 쪽에서 막아 두면 스캔 쪽(앱 M-12)의
 * 중복 처리 방지와 짝이 맞는다 — 한쪽만 막으면 이미 쓴 바코드가 계속 손에 남는다.
 *
 * 확인번호(`code`)와 바코드 값(`barcodeToken`)은 다른 것이다. 확인번호는 구독 id와
 * 날짜로 정해져 짐작할 수 있으므로, 스캔으로 수령 처리가 되는 값은 따로 만든다.
 * 회차를 확인번호로 찾는 것은 그래서 문제가 되지 않는다 — 본인 구독인지 한 번 더
 * 검사하고, 발급되는 값은 확인번호에서 유도되지 않는다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { code } = await params;

  const pickup = await prisma.pickupOrder.findUnique({
    where: { code },
    include: {
      subscription: {
        select: {
          id: true,
          userId: true,
          status: true,
          packSize: true,
          dressings: true,
          project: { select: { name: true, location: true } },
        },
      },
    },
  });
  if (!pickup || pickup.subscription.userId !== session.userId) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
  }

  if (pickup.status === "picked") {
    return NextResponse.json(
      {
        error: "이미 수령한 회차입니다.",
        code: "PICKUP_BARCODE_USED",
        pickedAt: pickup.pickedAt,
      },
      { status: 409 },
    );
  }
  if (pickup.status === "skipped") {
    return NextResponse.json(
      { error: "건너뛴 회차입니다.", code: "PICKUP_SKIPPED" },
      { status: 400 },
    );
  }
  if (pickup.subscription.status === "cancelled") {
    return NextResponse.json(
      { error: "해지된 구독입니다.", code: "SUBSCRIPTION_CANCELLED" },
      { status: 400 },
    );
  }

  let token = pickup.barcodeToken;
  let issuedAt = pickup.barcodeIssuedAt;
  if (!token) {
    token = randomBytes(16).toString("hex");
    const issued = await prisma.pickupOrder.update({
      where: { id: pickup.id },
      data: { barcodeToken: token, barcodeIssuedAt: new Date() },
    });
    issuedAt = issued.barcodeIssuedAt;
  }

  return NextResponse.json({
    barcode: {
      pickupId: pickup.id,
      code: pickup.code,
      token,
      issuedAt,
      scheduledAt: pickup.scheduledAt,
      status: pickup.status,
      storeName: pickup.subscription.project.name,
      storeLocation: pickup.subscription.project.location,
      packSize: pickup.subscription.packSize,
      dressingCount: pickup.subscription.dressings.length,
    },
  });
}
