import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 명세 7.1 알림 수신 설정.
// 언제나 세션의 userId 로만 조회·저장한다. 클라이언트가 보내는 userId 는 신뢰하지 않는다.

const TYPES = [
  { type: "device_critical", label: "설비 위험 알림", caption: "임계값 초과·설비 정지 등 즉시 조치가 필요한 알림", byDefault: true },
  { type: "device_warning", label: "설비 주의 알림", caption: "임계값 근접·스케줄 지연 등 확인이 필요한 알림", byDefault: true },
  { type: "stock_low", label: "재고 부족 알림", caption: "품목 수량이 부족 기준 이하로 내려갈 때", byDefault: true },
  { type: "harvest", label: "수확 예정 알림", caption: "재배 일정의 수확 예정일 3일 전", byDefault: false },
  { type: "report", label: "주간 리포트", caption: "매주 월요일 지난주 매출·판매 요약", byDefault: false },
] as const;

const CHANNELS = ["push", "sms", "both"];

// GET /api/notification-prefs
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rows = await prisma.notificationPref.findMany({ where: { userId: session.userId } });
  const byType = new Map(rows.map((r) => [r.type, r]));

  // 저장 안 된 유형은 기본값으로 채워 항상 5종을 다 내린다.
  const prefs = TYPES.map((t) => {
    const row = byType.get(t.type);
    return {
      type: t.type,
      label: t.label,
      caption: t.caption,
      enabled: row?.enabled ?? t.byDefault,
      channel: row?.channel ?? "push",
      source: row ? "user" : "default",
    };
  });

  return NextResponse.json({ prefs });
}

// PUT /api/notification-prefs  { prefs: [{ type, enabled, channel }] }
export async function PUT(req: Request) {
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

  const { prefs } = (body ?? {}) as { prefs?: unknown };
  if (!Array.isArray(prefs) || prefs.length === 0) {
    return NextResponse.json({ error: "prefs가 비어 있습니다." }, { status: 400 });
  }

  const known = new Set(TYPES.map((t) => t.type));
  const validated: { type: string; enabled: boolean; channel: string }[] = [];
  for (const raw of prefs) {
    const { type, enabled, channel } = (raw ?? {}) as Record<string, unknown>;
    if (typeof type !== "string" || !known.has(type as (typeof TYPES)[number]["type"])) {
      return NextResponse.json({ error: `알 수 없는 알림 유형: ${String(type)}` }, { status: 400 });
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: `${type}: enabled는 true/false 여야 합니다.` }, { status: 400 });
    }
    const ch = typeof channel === "string" ? channel : "push";
    if (!CHANNELS.includes(ch)) {
      return NextResponse.json({ error: `${type}: 알 수 없는 채널 ${ch}` }, { status: 400 });
    }
    validated.push({ type, enabled, channel: ch });
  }

  await prisma.$transaction(
    validated.map((v) =>
      prisma.notificationPref.upsert({
        where: { userId_type: { userId: session.userId, type: v.type } },
        create: { userId: session.userId, type: v.type, enabled: v.enabled, channel: v.channel },
        update: { enabled: v.enabled, channel: v.channel },
      })
    )
  );

  return NextResponse.json({ saved: validated.length });
}
