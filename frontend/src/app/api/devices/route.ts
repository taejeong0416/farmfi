import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { operatorGate } from "@/lib/operator-scope";
import { prisma } from "@/lib/db";

// 명세 4.2 설비 제어.
//
// 제어는 낙관적으로 끝내지 않는다. 명령을 pending 으로 남기고 결과가 확정된
// 뒤에만 Device.isOn 을 바꾼다. 실제 설비 게이트웨이가 붙기 전까지는
// 즉시 성공 처리하되, 이력에 그 사실이 남아 나중에 구분할 수 있게 한다.
//
// 명세 예외 두 가지를 여기서 지킨다:
//  - 같은 설비에 pending 명령이 있으면 중복 전송을 막는다
//  - 제어 불가(controllable=false) 설비는 409 로 거절한다

// GET /api/devices?projectId=&bed=
export async function GET(req: NextRequest) {
  const gate = await operatorGate(req);
  if (gate instanceof Response) return gate;
  const projectId = gate.projectId;
  const bed = req.nextUrl.searchParams.get("bed");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const devices = await prisma.device.findMany({
    where: { projectId, ...(bed ? { bed } : {}) },
    orderBy: [{ bed: "asc" }, { kind: "asc" }],
  });

  const pending = await prisma.deviceCommand.findMany({
    where: { deviceId: { in: devices.map((d) => d.id) }, status: "pending" },
    select: { deviceId: true },
  });
  const pendingSet = new Set(pending.map((p) => p.deviceId));

  return NextResponse.json({
    projectId,
    devices: devices.map((d) => ({
      id: d.id,
      bed: d.bed,
      kind: d.kind,
      name: d.name,
      isOn: d.isOn,
      controllable: d.controllable,
      pending: pendingSet.has(d.id),
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
}

// POST /api/devices  { deviceId, targetState }
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { deviceId, targetState } = (body ?? {}) as { deviceId?: unknown; targetState?: unknown };
  if (typeof deviceId !== "string" || !deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  if (typeof targetState !== "boolean") {
    return NextResponse.json({ error: "targetState는 true/false 여야 합니다." }, { status: 400 });
  }

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) {
    return NextResponse.json({ error: "설비를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!device.controllable) {
    return NextResponse.json({ error: "자동 제어 설비는 수동 조작할 수 없습니다." }, { status: 409 });
  }
  if (device.isOn === targetState) {
    // 이미 그 상태다. 명령을 만들지 않고 현재 상태를 그대로 알린다(멱등).
    return NextResponse.json({ deviceId, isOn: device.isOn, status: "noop" });
  }

  const inFlight = await prisma.deviceCommand.findFirst({
    where: { deviceId, status: "pending" },
    select: { id: true },
  });
  if (inFlight) {
    return NextResponse.json(
      { error: "이전 제어 명령이 아직 처리 중입니다.", status: "pending" },
      { status: 409 }
    );
  }

  const command = await prisma.deviceCommand.create({
    data: { deviceId, requestedBy: session.userId, targetState, status: "pending" },
  });

  // 게이트웨이 미연결 구간 — 명령을 즉시 확정 처리한다.
  // failReason 에 근거를 남겨 "실제 설비 응답"과 구분되게 한다.
  const [, updated] = await prisma.$transaction([
    prisma.deviceCommand.update({
      where: { id: command.id },
      data: { status: "success", resolvedAt: new Date(), failReason: "gateway-not-connected:auto-ack" },
    }),
    prisma.device.update({ where: { id: deviceId }, data: { isOn: targetState } }),
  ]);

  return NextResponse.json({
    deviceId,
    isOn: updated.isOn,
    status: "success",
    commandId: command.id,
    // 화면이 "실제 설비 응답이 아님"을 표시할 수 있도록 내려준다.
    simulated: true,
  });
}
