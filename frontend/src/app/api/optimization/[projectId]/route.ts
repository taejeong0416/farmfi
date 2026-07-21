import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  dliSchedule,
  dliFeedback,
  maintenanceRisk,
  seedingPlan,
  nutrientAdvice,
  holtWintersForecast,
  cusumDrift,
  weatherCompensatedCusum,
  supplementalTrigger,
  peakStagger,
  annealJointSchedule,
  thompsonCropAllocation,
  operationsSavingsReport,
  TARIFF_TOU_GENERAL,
  TARIFF_FLAT_AGRI,
} from "@/lib/optimization";
import { fetchSalesData } from "@/lib/opendata";
import { getCrop } from "@/lib/crop-profiles";
import { IoTReading } from "@/lib/iot-health";
import fleetBaseline from "../../../../../prisma/fleet-baseline.json";

// GET /api/optimization/[projectId]?crop=leafy&tariff=tou|agri&ledKw=4&indoor=1
// 실 IoT 데이터로 3층(미시 알고리즘·중간 아키텍처·거시 재무) 최적화 리포트 생성.
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

    const iotRaw = await prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      take: 336, // 최근 14일
    });
    if (iotRaw.length === 0) {
      return NextResponse.json(
        { error: "No IoT data. Run seed:opendata first." },
        { status: 404 }
      );
    }
    const iot = [...iotRaw].reverse();
    const readings: IoTReading[] = iot.map((d) => ({
      temperature: d.temperature,
      humidity: d.humidity,
      co2Level: d.co2Level,
      lightIntensity: d.lightIntensity,
      phLevel: d.phLevel,
    }));

    const cropKey = sp.get("crop") ?? "leafy";
    const crop = getCrop(cropKey);
    const tariffKey = sp.get("tariff") === "agri" ? "agri" : "tou";
    const tariff = tariffKey === "agri" ? TARIFF_FLAT_AGRI : TARIFF_TOU_GENERAL;
    const ledPowerKw = Number(sp.get("ledKw") ?? 4);
    const indoor = sp.get("indoor") !== "0";

    // 미시 ① DLI 광주기 (농학 제약 + TOU + 탄소)
    const dli = dliSchedule({ cropKey, ledPowerKw, tariff });
    // 미시 ①-피드백 (닫힌 루프)
    const recentLux = iot.slice(-24).map((d) => d.lightIntensity);
    const feedback = dliFeedback({ cropKey, recentLux });

    // 미시 ② 피크 분산 (기본요금)
    const peak = peakStagger([
      { name: "LED", kw: ledPowerKw, hoursNeeded: dli.requiredHours, fixedHours: dli.litHours },
      { name: "공조", kw: 1.5, hoursNeeded: 10 },
      { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
    ]);
    // 미시 ②-b SA 통합 전역 최적화
    const joint = annealJointSchedule({
      ledPowerKw,
      photoperiodHours: dli.requiredHours,
      tariff,
      flexLoads: [
        { name: "공조", kw: 1.5, hoursNeeded: 10 },
        { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
      ],
    });

    // 미시 ③ 예지보전: 원시 CUSUM + 외부기상 차분(계절 상쇄) + 플릿 콜드스타트
    const maintenance = maintenanceRisk(readings);
    const rawCusum = cusumDrift(readings, { lag: 24 }).filter((c) => c.detected);
    const internal = iot.map((d) => d.temperature);
    // 외부온도: 실데이터에 있으면 사용(현재 IotData 스키마엔 미저장 → 조도 프록시 역산 대신
    // 데이터가 외부기상을 담은 경우에만 의미. 여기선 fleet 사전분포로 콜드스타트 시연).
    const external = iot.map((d) => d.temperature - fleetBaseline.tempDiff.median);
    const weatherCusum = weatherCompensatedCusum(internal, external, {
      fleetPrior: fleetBaseline.tempDiff,
    });

    // 미시 ④ 수요예측(Holt-Winters) → 파종
    const sales = await fetchSalesData();
    const forecast = holtWintersForecast(sales.map((s) => s.units));
    const monthlySalesForecast = Number(sp.get("forecast") ?? forecast.monthlyTotal);
    const seeding = seedingPlan({ monthlySalesForecast });
    const nutrient = nutrientAdvice(readings[readings.length - 1], cropKey);

    // 미시 ⑤ 작물 믹스 밴딧 (엽채류 주력 기준 재구성)
    const cropMix = thompsonCropAllocation({
      arms: [
        { name: "상추(엽채류)", trueMeanMargin: 7000, trueStd: 1800 },
        { name: "바질(허브)", trueMeanMargin: 11000, trueStd: 3500 },
        { name: "마이크로그린", trueMeanMargin: 15000, trueStd: 6000 },
      ],
      rounds: 200,
    });

    // 중간: 보광 트리거(실내 vs 온실 하이브리드)
    const hourlyInsolation = iot.slice(-24).map(() => 0); // IotData에 외부일사량 미저장 → 실내 가정
    const supplemental = supplementalTrigger({ cropKey, hourlyInsolation, indoor });

    // 거시: 재무 환산 리포트
    const savings = operationsSavingsReport({
      dliSavingPerMonth: dli.savingPerMonth,
      peakSavingPerMonth: peak.demandChargeSavingPerMonth,
      saImprovementPerMonth: joint.improvementPerMonth,
      wasteReductionUnits: seeding.expectedWasteReduction,
      dliCo2PerMonth: dli.co2SavedKgPerMonth,
      confidence: "projected",
    });

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      crop: { key: crop.key, label: crop.label, dliTarget: crop.dliTarget },
      generatedAt: new Date().toISOString(),
      inputs: {
        cropKey,
        tariff: tariffKey,
        ledPowerKw,
        indoor,
        monthlySalesForecast,
        iotRecords: iot.length,
        salesRecords: sales.length,
        fleet: fleetBaseline.meta,
      },
      micro: { dli, feedback, peak, joint, forecast, seeding, cropMix, nutrient },
      meso: { rawCusum, weatherCusum, supplemental, maintenance },
      macro: { savings },
    });
  } catch (error) {
    console.error("Optimization API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
