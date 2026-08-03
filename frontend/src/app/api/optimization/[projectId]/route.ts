import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildOptimizationReport } from "@/lib/optimization-report";
import { fetchSalesData, fetchOpenData, alignExternalSeries } from "@/lib/opendata";
import { IoTReading } from "@/lib/iot-health";
import fleetBaseline from "../../../../../prisma/fleet-baseline.json";

// GET /api/optimization/[projectId]?crop=leafy&tariff=tou|agri&ledKw=4&indoor=1
// 실 IoT 데이터로 3층(미시 알고리즘·중간 아키텍처·거시 재무) 최적화 리포트 생성.
// 계산은 buildOptimizationReport 한 곳에서만 한다 — 웹 페이지와 같은 숫자를 내기 위해서.
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

    const iotRaw = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      take: 336, // 최근 14일
    });
    if (iotRaw.length === 0) {
      return NextResponse.json(
        { error: "No IoT data. Run seed:opendata first." },
        { status: 404 }
      );
    }
    const iot = [...iotRaw].reverse();
    const readings: IoTReading[] = iot.map((d) => ({
      temperature: d.temperature,
      humidity: d.humidity,
      co2Level: d.co2Level,
      lightIntensity: d.lightIntensity,
      phLevel: d.phLevel,
    }));

    const [sales, envRecs] = await Promise.all([fetchSalesData(), fetchOpenData()]);
    const external = alignExternalSeries(iot, envRecs);

    const forecastOverride = sp.get("forecast");
    const report = buildOptimizationReport({
      projectId: project.id,
      projectName: project.name,
      readings,
      externalTempC: external.extTemp,
      externalInsolationWm2: external.extInsolation,
      salesUnits: sales.map((s) => s.units),
      fleetPrior: fleetBaseline.tempDiff,
      cropKey: sp.get("crop") ?? undefined,
      tariffKey: sp.get("tariff") === "agri" ? "agri" : "tou",
      ledPowerKw: sp.get("ledKw") ? Number(sp.get("ledKw")) : undefined,
      indoor: sp.get("indoor") !== "0",
      monthlySalesForecast: forecastOverride ? Number(forecastOverride) : undefined,
    });

    return NextResponse.json({
      ...report,
      generatedAt: new Date().toISOString(),
      fleet: fleetBaseline.meta,
    });
  } catch (error) {
    console.error("Optimization API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
