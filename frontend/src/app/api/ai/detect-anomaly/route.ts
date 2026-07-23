import { NextRequest, NextResponse } from "next/server";
import { detectAnomalies, isHealthy, IoTReading } from "@/lib/iot-health";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
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

    // 가동률(uptime): 모든 센서가 도메인 정상범위 안인 판독의 비율.
    // 마일스톤 IoT 게이트(가동률 90%+ · verify 라우트)가 소비한다.
    const healthyCount = readings.filter(isHealthy).length;
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
