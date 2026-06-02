import { NextRequest, NextResponse } from "next/server";
import {
  detectAnomalies,
  calculateUptimeRate,
  IoTReading,
} from "@/lib/anomaly-detector";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { projectId, milestoneId } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Fetch last 100 IoT readings for this project
    const iotRecords = await prisma.ioTData.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (iotRecords.length === 0) {
      return NextResponse.json({
        anomalyDetected: false,
        anomalyScore: 0,
        affectedSensors: [],
        uptimeRate: milestoneId ? 100 : undefined,
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

    let uptimeRate: number | undefined;

    if (milestoneId) {
      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
      });

      if (milestone?.iotMinDays) {
        uptimeRate = calculateUptimeRate(anomalyResults);
      }
    }

    return NextResponse.json({
      anomalyDetected: hasAnomaly,
      anomalyScore: Math.round(maxScore * 100) / 100,
      affectedSensors: allAffected,
      uptimeRate,
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
