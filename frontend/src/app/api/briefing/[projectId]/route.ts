import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  maintenanceRisk,
  cusumDrift,
  holtWintersForecast,
  seedingPlan,
} from "@/lib/optimization";
import { fetchSalesData } from "@/lib/opendata";
import { getCrop } from "@/lib/crop-profiles";
import { generateBriefing } from "@/lib/briefing";
import { runHarness, inferSeason } from "@/lib/llm-harness";
import { HEALTHY_RANGES, type IoTReading } from "@/lib/iot-health";

// GET /api/briefing/[projectId]?crop=leafy&ledKw=4
// 알고리즘 결과를 취합해 운영자용 아침 브리핑 JSON 반환.
// 환경조절(온도·CO2·pH)은 IoT 자동이라 브리핑에서 제외 — 물리 작업만 포함.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const sp = request.nextUrl.searchParams;
    const cropKey = sp.get("crop") ?? "leafy";
    const ledPowerKw = Number(sp.get("ledKw") ?? 4);

    // 프로젝트 존재 확인
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, createdAt: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // IoT 데이터 조회 (최근 14일 = 336건 @30분 간격)
    const iotRaw = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "asc" },
      take: 336,
    });
    if (iotRaw.length === 0) {
      return NextResponse.json(
        { error: "No IoT data. Run seed:iot first." },
        { status: 404 }
      );
    }

    const readings: IoTReading[] = iotRaw.map((d) => ({
      temperature: d.temperature,
      humidity: d.humidity,
      co2Level: d.co2Level,
      lightIntensity: d.lightIntensity,
      phLevel: d.phLevel,
    }));

    // 알고리즘 ①: 예지보전
    const maintenance = maintenanceRisk(readings);

    // 알고리즘 ②: CUSUM 드리프트 시점 (데이터 충분할 때만)
    const lag = Math.min(48, Math.floor(readings.length / 4));
    const cusum =
      readings.length >= lag + 12
        ? cusumDrift(readings, { lag })
        : [];

    // 알고리즘 ③: 수요 예측 → 파종 계획
    const salesRaw = await fetchSalesData();
    const salesSeries = salesRaw.map((s) => s.units);
    const forecast = holtWintersForecast(salesSeries);
    const seeding = seedingPlan({ monthlySalesForecast: forecast.monthlyTotal });

    // 액추에이터 이상 감지 (최근 24건 기준)
    // 온도·CO2·pH는 IoT 자동제어 담당 — 브리핑에서 제외
    // lightIntensity = LED 액추에이터 → 이상 시 수동 점검 대상
    const recent = readings.slice(-24);
    const [liLo, liHi] = HEALTHY_RANGES.lightIntensity;
    const hasLedFailure = recent.some(
      (r) => r.lightIntensity < liLo || r.lightIntensity > liHi
    );
    // 양액 펌프 이상은 lightIntensity가 정상인데 pH 범위 이탈로 간접 감지
    // (단, pH 자체 조정은 IoT 자동이므로 브리핑엔 "펌프 점검"만 노출)
    const [phLo, phHi] = HEALTHY_RANGES.phLevel;
    const hasActuatorAnomaly = recent.some(
      (r) => r.phLevel < phLo || r.phLevel > phHi
    );

    // 재배 사이클 진행 일수 추정 (프로젝트 생성일 기준 모듈로)
    const crop = getCrop(cropKey);
    const projectAgeDays = Math.floor(
      (Date.now() - project.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const cycleDaysElapsed = projectAgeDays % crop.cycleDays;

    // 이상 센서 목록 (예지보전 기준 — 브리핑·하네스 공통 입력)
    const anomalySensors = maintenance.driftingSensors.map((d) => d.sensor);

    // LLM 하네스 실행 (어느 알고리즘을 추가로 호출할지 오케스트레이션)
    const now = new Date();
    const harnessResult = await runHarness({
      projectId,
      cropKey,
      ledPowerKw,
      season: inferSeason(now.getMonth() + 1),
      hasAnomalySensors: anomalySensors,
      iotReadings: readings,
      salesSeries,
    });

    // 브리핑 생성
    const briefing = await generateBriefing({
      projectId,
      cropKey,
      maintenance,
      cusum,
      forecast,
      seeding,
      cycleDaysElapsed,
      hasLedFailure,
      hasActuatorAnomaly,
    });

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      generatedAt: briefing.generatedAt,
      briefing: {
        items: briefing.items,
        narrative: briefing.narrative,
        isMock: briefing.isMock,
        llmProvider: briefing.llmProvider,
      },
      harness: {
        toolCalls: harnessResult.toolCalls.map((tc) => ({
          toolName: tc.toolName,
          reason: tc.reason,
          // output은 상세 데이터라 summary에서만 노출
        })),
        summary: harnessResult.summary,
        isMock: harnessResult.isMock,
        provider: harnessResult.provider,
      },
      inputs: {
        cropKey,
        cropLabel: crop.label,
        ledPowerKw,
        iotRecords: readings.length,
        salesRecords: salesRaw.length,
        cycleDaysElapsed,
        cycleDays: crop.cycleDays,
      },
    });
  } catch (error) {
    console.error("GET /api/briefing/[projectId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
