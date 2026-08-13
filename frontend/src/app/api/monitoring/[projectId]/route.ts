import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeGrowthMonitoring } from "@/lib/growth-monitoring";
import { cropKeyFor } from "@/lib/crop-profiles";
import { resolveDataWindow } from "@/lib/data-window";
import type { IoTReading } from "@/lib/iot-health";

// GET /api/monitoring/[projectId]?days=7
// 실시간 생육 모니터링 — 시계열 판독 + 이상탐지(Z-score/CUSUM/고장게이트/최적대) +
// 일적산 지표(DLI·GDD)와 수확 예측 합성. 웹 대시보드와 모바일 앱이 공유한다.
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

    // 재배 파라미터(정상범위·DLI 목표·적산온도)는 품목마다 다르다. 지점의 주력 품목
    // = 재배중 수량이 가장 많은 품목으로 잡는다. 재배 이력이 없으면 기본 작물.
    const lead = await prisma.inventory.findFirst({
      where: { projectId },
      orderBy: { growing: "desc" },
      select: { product: { select: { name: true, category: true } } },
    });
    const cropKey = cropKeyFor(lead?.product.name, lead?.product.category);

    // 창의 끝점은 현재가 아니라 이 지점의 센서 최신 시각이다 — 데이터가 멈춘 뒤에도
    // 최근 N일치를 계속 판독한다.
    const latest = await prisma.iotData.findFirst({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true },
    });
    const { since, dataAsOf, stale } = resolveDataWindow(latest?.recordedAt, days);


    // 오름차순(과거→현재) — 차트/CUSUM 인덱스가 시간순과 일치해야 한다.
    const records = await prisma.iotData.findMany({
      where: { projectId, recordedAt: { gte: since } },
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
    const growthRates = records.map((r) => r.growthRate);

    const analysis = analyzeGrowthMonitoring(
      readings,
      recordedAts,
      growthRates,
      cropKey
    );

    return NextResponse.json({
      project,
      days,
      dataAsOf,
      stale,
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
