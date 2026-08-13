import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HEALTHY_RANGES } from "@/lib/iot-health";

// 명세 4.2 센서 임계값 설정.
//
// 저장된 행이 없으면 HEALTHY_RANGES 기본값을 내린다. 즉 응답은 항상 5종을
// 다 채워서 주고, source 로 "기본값인지 지점 설정인지"를 구분한다.
// 화면이 빈 값을 만나 스스로 기본값을 지어내면 서버와 어긋나기 때문이다.

const SENSOR_KEYS = ["temperature", "humidity", "co2Level", "lightIntensity", "phLevel"] as const;
type SensorKey = (typeof SENSOR_KEYS)[number];

// GET /api/thresholds?projectId=...
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const rows = await prisma.sensorThreshold.findMany({ where: { projectId } });
  const bySensor = new Map(rows.map((r) => [r.sensor, r]));

  const thresholds = SENSOR_KEYS.map((sensor) => {
    const row = bySensor.get(sensor);
    const [dMin, dMax] = HEALTHY_RANGES[sensor];
    return {
      sensor,
      minValue: row?.minValue ?? dMin,
      maxValue: row?.maxValue ?? dMax,
      source: row ? "project" : "default",
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ projectId, thresholds });
}

// PUT /api/thresholds  { projectId, thresholds: [{ sensor, minValue, maxValue }] }
export async function PUT(req: NextRequest) {
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

  const { projectId, thresholds } = (body ?? {}) as {
    projectId?: unknown;
    thresholds?: unknown;
  };
  if (typeof projectId !== "string" || !projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    return NextResponse.json({ error: "thresholds가 비어 있습니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) {
    return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
  }

  // 전부 검증한 뒤에 쓴다 — 일부만 반영되면 화면이 보여준 값과 저장값이 어긋난다.
  const validated: { sensor: SensorKey; minValue: number; maxValue: number }[] = [];
  for (const raw of thresholds) {
    const { sensor, minValue, maxValue } = (raw ?? {}) as Record<string, unknown>;
    if (typeof sensor !== "string" || !SENSOR_KEYS.includes(sensor as SensorKey)) {
      return NextResponse.json({ error: `알 수 없는 센서: ${String(sensor)}` }, { status: 400 });
    }
    const min = Number(minValue);
    const max = Number(maxValue);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return NextResponse.json({ error: `${sensor}: 숫자가 아닙니다.` }, { status: 400 });
    }
    if (min >= max) {
      return NextResponse.json({ error: `${sensor}: 하한이 상한보다 작아야 합니다.` }, { status: 400 });
    }
    validated.push({ sensor: sensor as SensorKey, minValue: min, maxValue: max });
  }

  await prisma.$transaction(
    validated.map((v) =>
      prisma.sensorThreshold.upsert({
        where: { projectId_sensor: { projectId, sensor: v.sensor } },
        create: { projectId, sensor: v.sensor, minValue: v.minValue, maxValue: v.maxValue, updatedBy: session.userId },
        update: { minValue: v.minValue, maxValue: v.maxValue, updatedBy: session.userId },
      })
    )
  );

  return NextResponse.json({ projectId, saved: validated.length });
}
