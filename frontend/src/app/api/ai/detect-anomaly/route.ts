import { NextRequest, NextResponse } from "next/server";
import {
  detectAnomalies,
  uptimeRate,
  IoTReading,
} from "@/lib/iot-health";
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
    const iotRecords = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });

    if (iotRecords.length === 0) {
      // 데이터가 없으면 검증 불가 — 가동률 0으로 fail-closed
      return NextResponse.json({
        anomalyDetected: false,
        anomalyScore: 0,
        affectedSensors: [],
        dataCount: 0,
        uptimeRate: milestoneId ? 0 : undefined,
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

    let uptime: number | undefined;

    if (milestoneId) {
      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
      });

      if (milestone?.iotMinDays) {
        // 가동률은 최근 100건이 아니라 iotMinDays 기간 전체를 도메인 정상범위로 판정
        const windowStart = new Date(
          Date.now() - milestone.iotMinDays * 24 * 60 * 60 * 1000
        );
        const windowRecords = await prisma.iotData.findMany({
          where: { projectId, recordedAt: { gte: windowStart } },
          orderBy: { recordedAt: "desc" },
        });

        // 데이터 없으면 uptimeRate가 0 반환 (fail-closed)
        uptime = uptimeRate(
          windowRecords.map((r) => ({
            temperature: r.temperature,
            humidity: r.humidity,
            co2Level: r.co2Level,
            lightIntensity: r.lightIntensity,
            phLevel: r.phLevel,
          }))
        );
      }
    }

    return NextResponse.json({
      anomalyDetected: hasAnomaly,
      anomalyScore: Math.round(maxScore * 100) / 100,
      affectedSensors: allAffected,
      dataCount: iotRecords.length,
      uptimeRate: uptime,
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
