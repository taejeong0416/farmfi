import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  optimizeLedSchedule,
  maintenanceRisk,
  seedingPlan,
  nutrientAdvice,
  TARIFF_TOU_GENERAL,
  TARIFF_FLAT_AGRI,
} from "@/lib/optimization";
import { IoTReading } from "@/lib/iot-health";

// GET /api/optimization/[projectId]?tariff=tou|agri&ledKw=4&photoperiod=14&forecast=400
// 최근 48h IoT 데이터로 전력·예지보전·자원 최적화 리포트를 생성한다.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const sp = request.nextUrl.searchParams;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const iot = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      take: 96, // 30분 간격 48h
    });
    if (iot.length === 0) {
      return NextResponse.json(
        { error: "No IoT data. Run seed:iot or seed:opendata first." },
        { status: 404 }
      );
    }

    const readings: IoTReading[] = [...iot].reverse().map((d) => ({
      temperature: d.temperature,
      humidity: d.humidity,
      co2Level: d.co2Level,
      lightIntensity: d.lightIntensity,
      phLevel: d.phLevel,
    }));

    const tariffKey = sp.get("tariff") === "agri" ? "agri" : "tou";
    const tariff = tariffKey === "agri" ? TARIFF_FLAT_AGRI : TARIFF_TOU_GENERAL;
    const ledPowerKw = Number(sp.get("ledKw") ?? 4);
    const photoperiodHours = Number(sp.get("photoperiod") ?? 14);
    const monthlySalesForecast = Number(sp.get("forecast") ?? 400);

    const power = optimizeLedSchedule({ photoperiodHours, ledPowerKw, tariff });
    const maintenance = maintenanceRisk(readings);
    const seeding = seedingPlan({ monthlySalesForecast });
    const nutrient = nutrientAdvice(readings[readings.length - 1]);

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      generatedAt: new Date().toISOString(),
      inputs: { tariff: tariffKey, ledPowerKw, photoperiodHours, monthlySalesForecast, iotRecords: iot.length },
      power,
      maintenance,
      seeding,
      nutrient,
    });
  } catch (error) {
    console.error("Optimization API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
