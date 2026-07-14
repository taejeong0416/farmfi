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

    const growthRate = latest
      ? latest.growthRate + 0.1 + Math.random() * 0.2
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

    // The new data point is the first in the list (most recent)
    const newPointAnomaly = anomalyResults[0];

    // Update the record with anomaly info
    const updated = await prisma.iotData.update({
      where: { id: newData.id },
      data: {
        anomalyScore: newPointAnomaly.anomalyScore,
        isAnomaly: newPointAnomaly.isAnomaly,
      },
    });

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
