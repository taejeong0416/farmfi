import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectAnomalies } from "@/lib/iot-health";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const hour = new Date().getHours();

    const temperature = 22 + Math.sin(hour / 3) * 2 + (Math.random() - 0.5);
    const humidity =
      65 + Math.cos(hour / 4) * 5 + (Math.random() * 3 - 1.5);
    const co2Level = 950 + Math.random() * 250;
    const lightIntensity =
      hour >= 6 && hour <= 20 ? 12000 + Math.random() * 3000 : 0;
    const phLevel = 6.0 + Math.random() * 0.5;

    // Fetch latest IoT data to increment growthRate
    const latest = await prisma.iotData.findFirst({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
    });

    // 시드(iot-seed.ts)와 동일하게 100%에 캡
    const growthRate = latest
      ? Math.min(100, latest.growthRate + 0.1 + Math.random() * 0.2)
      : 0.1 + Math.random() * 0.2;

    // Create the data point (anomaly fields will be updated after detection)
    const newData = await prisma.iotData.create({
      data: {
        projectId,
        temperature: Math.round(temperature * 10) / 10,
        humidity: Math.round(humidity * 10) / 10,
        co2Level: Math.round(co2Level),
        lightIntensity: Math.round(lightIntensity),
        phLevel: Math.round(phLevel * 100) / 100,
        growthRate: Math.round(growthRate * 10) / 10,
      },
    });

    // Fetch last 50 records for anomaly detection context
    const recentData = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      take: 50,
    });

    const readings = recentData.map((d) => ({
      temperature: d.temperature,
      humidity: d.humidity,
      co2Level: d.co2Level,
      lightIntensity: d.lightIntensity,
      phLevel: d.phLevel,
    }));

    const anomalyResults = detectAnomalies(readings);

    // 방금 만든 레코드의 판정을 id로 찾는다 — 동시 요청이 사이에 끼어도
    // "첫 건 = 내 레코드" 가정이 깨지지 않도록.
    const newIdx = recentData.findIndex((d) => d.id === newData.id);
    const newPointAnomaly = anomalyResults[Math.max(newIdx, 0)];

    // Update the record with anomaly info
    const updated = await prisma.iotData.update({
      where: { id: newData.id },
      data: {
        anomalyScore: newPointAnomaly.anomalyScore,
        isAnomaly: newPointAnomaly.isAnomaly,
      },
    });

    // 생육 이상 알림 발송 — 이상치면 Notification 적재 (운영자 조회용)
    if (newPointAnomaly.isAnomaly) {
      const sensors = newPointAnomaly.affectedSensors.join(", ") || "복합 패턴";
      await prisma.notification.create({
        data: {
          projectId,
          type: "anomaly_detected",
          message: `생육 이상 감지 · ${sensors} (이상 스코어 ${newPointAnomaly.anomalyScore.toFixed(2)})`,
        },
      });
    }

    return NextResponse.json(
      serialize({
        data: updated,
        anomaly: {
          detected: newPointAnomaly.isAnomaly,
          score: newPointAnomaly.anomalyScore,
        },
      })
    );
  } catch (error) {
    console.error("POST /api/iot/generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate IoT data" },
      { status: 500 }
    );
  }
}
