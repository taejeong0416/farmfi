import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  optimizeLedSchedule,
  maintenanceRisk,
  seedingPlan,
  nutrientAdvice,
  holtWintersForecast,
  cusumDrift,
  peakStagger,
  annealJointSchedule,
  thompsonCropAllocation,
  TARIFF_TOU_GENERAL,
  TARIFF_FLAT_AGRI,
} from "@/lib/optimization";
import { fetchSalesData } from "@/lib/opendata";
import { IoTReading } from "@/lib/iot-health";

// GET /api/optimization/[projectId]?tariff=tou|agri&ledKw=4&photoperiod=14&forecast=400
// 최근 48h IoT 데이터로 전력·예지보전·자원 최적화 리포트를 생성한다.
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

    const iot = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      take: 96, // 30분 간격 48h
    });
    if (iot.length === 0) {
      return NextResponse.json(
        { error: "No IoT data. Run seed:iot or seed:opendata first." },
        { status: 404 }
      );
    }

    const readings: IoTReading[] = [...iot].reverse().map((d) => ({
      temperature: d.temperature,
      humidity: d.humidity,
      co2Level: d.co2Level,
      lightIntensity: d.lightIntensity,
      phLevel: d.phLevel,
    }));

    const tariffKey = sp.get("tariff") === "agri" ? "agri" : "tou";
    const tariff = tariffKey === "agri" ? TARIFF_FLAT_AGRI : TARIFF_TOU_GENERAL;
    const ledPowerKw = Number(sp.get("ledKw") ?? 4);
    const photoperiodHours = Number(sp.get("photoperiod") ?? 14);

    // ① 전력량요금: TOU 광주기 최적화
    const power = optimizeLedSchedule({ photoperiodHours, ledPowerKw, tariff });

    // ② 기본요금: LED 확정 스케줄을 고정 부하로 두고 공조·펌프를 스태거링
    const ledHours = power.optimizedBlocks.flatMap((b) =>
      Array.from({ length: b.hours }, (_, i) => (b.startHour + i) % 24)
    );
    const peak = peakStagger([
      { name: "LED", kw: ledPowerKw, hoursNeeded: photoperiodHours, fixedHours: ledHours },
      { name: "공조", kw: 1.5, hoursNeeded: 10 },
      { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
    ]);

    // ②-b 통합 최적화(SA): 전력량요금+기본요금을 단일 목적함수로 전역 탐색
    const joint = annealJointSchedule({
      ledPowerKw,
      photoperiodHours,
      tariff,
      flexLoads: [
        { name: "공조", kw: 1.5, hoursNeeded: 10 },
        { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
      ],
    });

    // ⑤ 작물 믹스 밴딧 (톰슨 샘플링) — 파라미터는 시뮬레이션, 실측 마진 축적 시 교체
    const cropMix = thompsonCropAllocation({
      arms: [
        { name: "새싹삼", trueMeanMargin: 9000, trueStd: 2500 },
        { name: "바질(허브)", trueMeanMargin: 12000, trueStd: 4000 },
        { name: "마이크로그린", trueMeanMargin: 15000, trueStd: 6000 },
      ],
      rounds: 200,
    });

    // ③ 예지보전: 평균 이동 요약 + CUSUM 교차 시점
    const maintenance = maintenanceRisk(readings);
    const cusum = cusumDrift(readings).filter((c) => c.detected);

    // ④ 수요 예측 → 파종 계획: POS 시계열(Holt-Winters). ?forecast= 로 수동 오버라이드 가능
    const sales = await fetchSalesData();
    const forecast = holtWintersForecast(sales.map((s) => s.units));
    const monthlySalesForecast = Number(sp.get("forecast") ?? forecast.monthlyTotal);
    const seeding = seedingPlan({ monthlySalesForecast });
    const nutrient = nutrientAdvice(readings[readings.length - 1]);

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      generatedAt: new Date().toISOString(),
      inputs: { tariff: tariffKey, ledPowerKw, photoperiodHours, monthlySalesForecast, iotRecords: iot.length, salesRecords: sales.length },
      power,
      peak,
      joint,
      maintenance,
      cusum,
      forecast,
      seeding,
      cropMix,
      nutrient,
    });
  } catch (error) {
    console.error("Optimization API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
