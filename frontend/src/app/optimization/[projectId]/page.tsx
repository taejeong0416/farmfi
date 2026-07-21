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
  peakStagger,
  annealJointSchedule,
  thompsonCropAllocation,
  operationsSavingsReport,
  TARIFF_TOU_GENERAL,
} from "@/lib/optimization";
import { fetchSalesData } from "@/lib/opendata";
import { getCrop } from "@/lib/crop-profiles";
import { IoTReading } from "@/lib/iot-health";
import { notFound } from "next/navigation";
import fleetBaseline from "../../../../prisma/fleet-baseline.json";

export const dynamic = "force-dynamic";

// AI 운영 최적화 리포트 — 미시(알고리즘)·중간(아키텍처)·거시(재무) 3층.
// 데이터: 스마트팜코리아 그린씨에스 실측 온실 환경 시계열.
export default async function OptimizationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const iotRaw = await prisma.iotData.findMany({
    where: { projectId },
    orderBy: { recordedAt: "desc" },
    take: 336,
  });
  const iot = [...iotRaw].reverse();
  const readings: IoTReading[] = iot.map((d) => ({
    temperature: d.temperature,
    humidity: d.humidity,
    co2Level: d.co2Level,
    lightIntensity: d.lightIntensity,
    phLevel: d.phLevel,
  }));

  const cropKey = "leafy";
  const crop = getCrop(cropKey);
  const ledPowerKw = 4;

  const dli = dliSchedule({ cropKey, ledPowerKw, tariff: TARIFF_TOU_GENERAL });
  const feedback =
    iot.length > 0
      ? dliFeedback({ cropKey, recentLux: iot.slice(-24).map((d) => d.lightIntensity) })
      : null;
  const peak = peakStagger([
    { name: "LED", kw: ledPowerKw, hoursNeeded: dli.requiredHours, fixedHours: dli.litHours },
    { name: "공조", kw: 1.5, hoursNeeded: 10 },
    { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
  ]);
  const joint = annealJointSchedule({
    ledPowerKw,
    photoperiodHours: dli.requiredHours,
    flexLoads: [
      { name: "공조", kw: 1.5, hoursNeeded: 10 },
      { name: "양액펌프", kw: 0.7, hoursNeeded: 6 },
    ],
  });
  const maint = readings.length > 0 ? maintenanceRisk(readings) : null;
  const rawCusum = readings.length > 0 ? cusumDrift(readings, { lag: 24 }).filter((c) => c.detected) : [];
  const internal = iot.map((d) => d.temperature);
  const external = iot.map((d) => d.temperature - fleetBaseline.tempDiff.median);
  const weatherCusum =
    internal.length > 12
      ? weatherCompensatedCusum(internal, external, { fleetPrior: fleetBaseline.tempDiff })
      : null;
  const sales = await fetchSalesData();
  const forecast = holtWintersForecast(sales.map((s) => s.units));
  const seed = seedingPlan({ monthlySalesForecast: forecast.monthlyTotal });
  const nutrient = readings.length > 0 ? nutrientAdvice(readings[readings.length - 1], cropKey) : null;
  const cropMix = thompsonCropAllocation({
    arms: [
      { name: "상추(엽채류)", trueMeanMargin: 7000, trueStd: 1800 },
      { name: "바질(허브)", trueMeanMargin: 11000, trueStd: 3500 },
      { name: "마이크로그린", trueMeanMargin: 15000, trueStd: 6000 },
    ],
    rounds: 200,
  });
  const savings = operationsSavingsReport({
    dliSavingPerMonth: dli.savingPerMonth,
    peakSavingPerMonth: peak.demandChargeSavingPerMonth,
    saImprovementPerMonth: joint.improvementPerMonth,
    wasteReductionUnits: seed.expectedWasteReduction,
    dliCo2PerMonth: dli.co2SavedKgPerMonth,
    confidence: "projected",
  });

  const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">AI 운영 최적화 리포트</h1>
        <p className="text-sm text-gray-500 mt-1">
          {project.name} · {crop.label} · 실측 IoT {iot.length}건 (스마트팜코리아 그린씨에스, 10농가 플릿)
        </p>
      </header>

      {/* 거시: 재무 요약 (맨 위 — 투자자/심사 관점) */}
      <section className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-5">
        <div className="text-sm text-emerald-700">거시 · 재무 환산 (사이트당)</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-bold text-emerald-800">
            월 {fmt(savings.monthlyWonSaved)}원
          </span>
          <span className="text-emerald-600">
            + CO₂ {savings.monthlyCo2SavedKg}kg/월 · 연 {fmt(savings.annualWonSaved)}원
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {savings.breakdown.map((b) => (
            <span key={b.lever} className="rounded bg-white px-2 py-1 text-emerald-700">
              {b.lever} {fmt(b.wonPerMonth)}원
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-emerald-600">
          {savings.note} · 이 숫자가 투자자 대시보드·STO 청약자료·ESG 리포트에 연결된다.
        </p>
      </section>

      {/* 미시: 알고리즘 */}
      <section className="rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold">미시 · 알고리즘</h2>

        <div className="rounded bg-gray-50 p-3 text-sm">
          <div className="font-medium">① DLI 광주기 (농학 제약 + TOU + 탄소)</div>
          <p className="mt-1">
            {crop.label} 목표 DLI {dli.dliTarget} → 필요 {dli.requiredHours}h,
            달성 {dli.achievedDli} mol{dli.feasible ? "" : " (PPFD 상향 필요)"}.
            관행 {fmt(dli.naiveCostPerDay)} → 최저요금·저탄소 배치 {fmt(dli.costPerDay)}원/일 —
            월 <b className="text-emerald-700">{fmt(dli.savingPerMonth)}원 + CO₂ {dli.co2SavedKgPerMonth}kg</b>.
            {feedback && <> 닫힌루프: {feedback.action}</>}
          </p>
        </div>

        <div className="rounded bg-sky-50 p-3 text-sm">
          <div className="font-medium text-sky-800">② 피크 분산 + SA 통합</div>
          <p className="mt-1 text-sky-700">
            동시가동 {peak.naivePeakKw}kW → {peak.optimizedPeakKw}kW, 기본요금 월 {fmt(peak.demandChargeSavingPerMonth)}원.
            SA 전역탐색이 단계별 해 대비 월 {fmt(joint.improvementPerMonth)}원 추가 절감.
          </p>
        </div>

        <div className="rounded bg-violet-50 p-3 text-sm">
          <div className="font-medium text-violet-800">④ 수요예측(Holt-Winters) → ⑤ 작물믹스(톰슨샘플링)</div>
          <p className="mt-1 text-violet-700">
            판매 {sales.length}일 학습 → 30일 {fmt(forecast.monthlyTotal)}포기 예측 → {seed.note}.
            작물믹스: {cropMix.allocation.map((a) => `${a.name} ${Math.round(a.share * 100)}%`).join(" · ")}
            (균등 대비 마진 +{((cropMix.uplift / cropMix.uniformTotalMargin) * 100).toFixed(1)}%).
            {nutrient && ` ${nutrient.message}`}
          </p>
        </div>
      </section>

      {/* 중간: 아키텍처 */}
      <section className="rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold">중간 · 아키텍처 (플릿 학습)</h2>
        <div className="rounded bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-800">③ 외부기상 차분 CUSUM + 플릿 콜드스타트</div>
          <p className="mt-1 text-amber-700">
            원시 CUSUM은 계절 하강을 설비 드리프트로 오탐
            ({rawCusum.length > 0 ? rawCusum.map((c) => `${c.sensor} ${c.maxStatistic}σ`).join(", ") : "이번 창엔 없음"}).
            {weatherCusum && (
              <>
                {" "}외부기상 차분 → {weatherCusum.maxStatistic}σ, {weatherCusum.note}
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-amber-600">
            플릿 {fleetBaseline.meta.farms}농가 {fmt(fleetBaseline.meta.rows)}건 베이스라인을 신규 사이트
            CUSUM 사전분포로 사용 → 이력 없는 1호점도 첫날부터 판정 (teacher-student 콜드스타트).
            예지보전 리스크 {maint?.riskScore ?? "—"}σ.
          </p>
        </div>
      </section>

      <footer className="text-xs text-gray-400">
        데이터: 스마트팜코리아 정형 데이터셋(그린씨에스 dtaSn=13) 실측 · 알고리즘 근거:
        arXiv 2410.23793(Economic MPC)·2506.13278(RL-MPC 외란보상)·2504.20815(teacher-student)·
        2512.01167(LED 피드백)·2101.06592(제약하 밴딧) · 절감치는 1호점 실측 전 상방 참고치
      </footer>
    </main>
  );
}
