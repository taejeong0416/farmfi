import { NextRequest, NextResponse } from "next/server";
import { detectAnomalies, isHealthy, IoTReading } from "@/lib/iot-health";
import { cropKeyFor } from "@/lib/crop-profiles";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // 마일스톤 IoT 게이트가 소비하는 판정 — 미인증 호출을 막는다.
  try {
    await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Fetch last 100 IoT readings for this project
    const iotRecords = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });

    if (iotRecords.length === 0) {
      return NextResponse.json({
        anomalyDetected: false,
        anomalyScore: 0,
        affectedSensors: [],
        uptimeRate: 0,
        dataCount: 0,
      });
    }

    const readings: IoTReading[] = iotRecords.map((r) => ({
      temperature: r.temperature,
      humidity: r.humidity,
      co2Level: r.co2Level,
      lightIntensity: r.lightIntensity,
      phLevel: r.phLevel,
    }));

    const anomalyResults = detectAnomalies(readings);

    const hasAnomaly = anomalyResults.some((r) => r.isAnomaly);
    const maxScore = Math.max(...anomalyResults.map((r) => r.anomalyScore));
    const allAffected = [
      ...new Set(anomalyResults.flatMap((r) => r.affectedSensors)),
    ];

    // 가동률(uptime): 모든 센서가 고장 게이트 안인 판독의 비율. 작물 최적대가 아니라
    // 넓은 고장 게이트를 쓴다 — 재는 대상이 "작물에 최적이었나"가 아니라 "설비가 살아
    // 있었나"이기 때문. 마일스톤 IoT 게이트(가동률 90%+ · verify 라우트)가 소비한다.
    const lead = await prisma.inventory.findFirst({
      where: { projectId },
      orderBy: { growing: "desc" },
      select: { product: { select: { name: true, category: true } } },
    });
    const cropKey = cropKeyFor(lead?.product.name, lead?.product.category);
    const healthyCount = readings.filter((r) => isHealthy(r, cropKey)).length;
    const uptimeRate = Math.round((healthyCount / readings.length) * 1000) / 10;

    return NextResponse.json({
      anomalyDetected: hasAnomaly,
      anomalyScore: Math.round(maxScore * 100) / 100,
      affectedSensors: allAffected,
      uptimeRate,
      dataCount: iotRecords.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        anomalyDetected: false,
        anomalyScore: 0,
        affectedSensors: [],
        error: message,
      },
      { status: 500 }
    );
  }
}
