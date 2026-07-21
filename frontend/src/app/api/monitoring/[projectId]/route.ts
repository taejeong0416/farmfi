import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeGrowthMonitoring } from "@/lib/growth-monitoring";
import type { IoTReading } from "@/lib/iot-health";

// GET /api/monitoring/[projectId]?days=7
// 실시간 생육 모니터링 — 시계열 판독 + 이상탐지(Z-score/CUSUM/절대범위) 합성.
// 웹 대시보드와 모바일 앱이 공유한다.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const daysParam = Number(
      request.nextUrl.searchParams.get("days") ?? "7"
    );
    // 1~60일로 클램프 (시드는 60일치 30분 간격 = 2,880건).
    const days = Number.isFinite(daysParam)
      ? Math.min(60, Math.max(1, Math.floor(daysParam)))
      : 7;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // 오름차순(과거→현재) — 차트/CUSUM 인덱스가 시간순과 일치해야 한다.
    const records = await prisma.iotData.findMany({
      where: { projectId, recordedAt: { gte: windowStart } },
      orderBy: { recordedAt: "asc" },
    });

    const readings: IoTReading[] = records.map((r) => ({
      temperature: r.temperature,
      humidity: r.humidity,
      co2Level: r.co2Level,
      lightIntensity: r.lightIntensity,
      phLevel: r.phLevel,
    }));
    const recordedAts = records.map((r) => r.recordedAt);

    const analysis = analyzeGrowthMonitoring(readings, recordedAts);

    return NextResponse.json({
      project,
      days,
      ...analysis,
    });
  } catch (error) {
    console.error("GET /api/monitoring/[projectId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch monitoring data" },
      { status: 500 }
    );
  }
}
