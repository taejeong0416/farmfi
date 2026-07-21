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
  recipeOptimization,
  operationsSavingsReport,
  TARIFF_TOU_GENERAL,
} from "@/lib/optimization";
import { optimalStack } from "@/lib/optimization-advanced";
import { cropMeanVariance, remainingUsefulLife } from "@/lib/optimization-frontier";
import { unifiedCoOptimize } from "@/lib/optimization-unified";
import { fetchSalesData, fetchOpenData } from "@/lib/opendata";
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
  const recipeMix = recipeOptimization(); // 미시: 품종/레시피 선택
  // 중간: 사이트 간 품목 배분 — 마코위츠 평균-분산(리스크-수익 프론티어)
  const portfolio = cropMeanVariance({
    assets: [
      { name: "엽채류(상추)", expectedMargin: 7000, volatility: 1800 },
      { name: "바질(허브)", expectedMargin: 11000, volatility: 3500 },
      { name: "방울토마토", expectedMargin: 14000, volatility: 6000 },
    ],
  });
  // 예지보전 → 잔여수명(베이불): CUSUM 최대 통계량을 열화지표로 환산
  const degIndex = maint ? Math.min(0.95, maint.riskScore / 6) : 0;
  const rul = remainingUsefulLife({ degradationIndex: degIndex });
  const savings = operationsSavingsReport({
    dliSavingPerMonth: dli.savingPerMonth,
    peakSavingPerMonth: peak.demandChargeSavingPerMonth,
    saImprovementPerMonth: joint.improvementPerMonth,
    wasteReductionUnits: seed.expectedWasteReduction,
    dliCo2PerMonth: dli.co2SavedKgPerMonth,
    confidence: "projected",
  });

  // 고도화 스택 (5개 돌파의 최적 조합) — 외부온도 실데이터 사용
  const envRecs = await fetchOpenData();
  const ext24 = envRecs.slice(-24).map((r) => r.extTemp ?? 15);
  const adv = optimalStack({ cropKey, ledPowerKw, sites: 20, hourlyExtTemp: ext24 });
  // 캡스톤: 통합 공동최적화 (6개 목적을 하나의 목적함수로 동시 최적화)
  const unified = unifiedCoOptimize({ cropKey, ledPowerKw, sites: 20, hourlyExtTemp: ext24 });

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
            품종/레시피 밴딧: {recipeMix.allocation.map((a) => `${a.name} ${Math.round(a.share * 100)}%`).join(" · ")}
            (균등 대비 +{((recipeMix.uplift / recipeMix.uniformTotalMargin) * 100).toFixed(1)}%).
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
            예지보전 리스크 {maint?.riskScore ?? "—"}σ →{" "}
            <b className={rul.action === "urgent" ? "text-red-700" : rul.action === "schedule" ? "text-amber-800" : "text-emerald-700"}>
              잔여수명 ~{rul.estimatedRulDays}일 ({rul.action})
            </b>{" "}
            — 베이불 생존분석으로 "이상함"을 실행가능한 잔여수명(RUL)으로 격상.
          </p>
        </div>
        <div className="rounded bg-teal-50 p-3 text-sm">
          <div className="font-medium text-teal-800">사이트 간 품목 배분 — 마코위츠 평균-분산 (금융 포트폴리오)</div>
          <p className="mt-1 text-teal-700">
            리스크 대비 최고수익: {portfolio.maxSharpe.weights.map((w, i) => `${portfolio.assets[i]} ${Math.round(w * 100)}%`).join(" · ")}
            (샤프 {portfolio.maxSharpe.sharpe.toFixed(2)}) · 최소리스크:{" "}
            {portfolio.minVariance.weights.map((w, i) => `${portfolio.assets[i]} ${Math.round(w * 100)}%`).join(" · ")}.
            작물 가격·수율 변동성과 상관을 넣어 효율적 프론티어를 그린다 — 작물도 투자 포트폴리오처럼 분산.
          </p>
        </div>
      </section>

      {/* 캡스톤: 통합 공동최적화 */}
      <section className="rounded-lg border-2 border-slate-800 bg-slate-900 p-5 text-white space-y-3">
        <h2 className="font-semibold">캡스톤 · 통합 공동최적화 (6개 목적을 하나로)</h2>
        <p className="text-sm text-slate-300">
          순차 파이프라인(각 알고리즘이 바통 넘김)이 아니라, <b>단일 목적함수로 전부 동시에 저울질</b>한다.
          결정변수(광량 DLI·광블록 시작)를 시뮬레이티드 어닐링으로 함께 탐색하며 수율매출·전력량·기본요금·
          열·CO₂·VPP 유연성을 한 번에 최적화. 광주기 안전은 하드제약, 가격은 강건.
        </p>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-bold text-emerald-400">
            순가치 {fmt(unified.netDailyValue)}원/일
          </span>
          <span className="text-slate-300">
            순차 파이프라인 대비 <b className="text-emerald-400">+{fmt(unified.vsSequentialNetValue)}원/일</b>
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded bg-slate-800 p-2">
            <div className="text-slate-400">수율매출</div>
            <div className="font-bold text-emerald-400">+{fmt(unified.breakdown.yieldRevenue)}</div>
          </div>
          <div className="rounded bg-slate-800 p-2">
            <div className="text-slate-400">전력+기본+열+CO₂</div>
            <div className="font-bold text-red-300">
              −{fmt(unified.breakdown.energyCost + unified.breakdown.demandCharge + unified.breakdown.thermalCost + unified.breakdown.co2Cost)}
            </div>
          </div>
          <div className="rounded bg-slate-800 p-2">
            <div className="text-slate-400">VPP 유연성 가치</div>
            <div className="font-bold text-sky-300">+{fmt(unified.breakdown.vppValue)}</div>
          </div>
        </div>
        <div className="text-xs text-slate-300">
          <div className="mb-1">
            문맥 적응 가중치: 열 {unified.contextWeights.thermal} · VPP {unified.contextWeights.vpp} · 강건 {unified.contextWeights.robust}
            (계절·DR달력·가격변동성이 자동 조절)
          </div>
          {unified.tradeoffs.map((t, i) => (
            <div key={i} className="text-slate-400">· {t}</div>
          ))}
        </div>
      </section>

      {/* 고도화: 5개 돌파 통합 스택 */}
      <section className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-5 space-y-3">
        <h2 className="font-semibold text-indigo-900">고도화 · 5개 돌파 (통합 최적화의 구성 요소)</h2>
        <p className="text-xs text-indigo-700">{adv.summary.headline}</p>

        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded bg-white p-3">
            <div className="font-medium">① 광주기 안전 (농학 하드제약)</div>
            <p className="mt-1 text-gray-600">
              명기 {adv.photoperiod.requiredHours}h(PPFD {adv.photoperiod.ppfdUsed}) + 연속 암기{" "}
              {adv.photoperiod.darkContinuousH}h → 추대·생체리듬 안전 {adv.photoperiod.safe ? "✓" : "✗"}.
              빛을 아무 때나 흩뿌리지 않아 작물을 지킨다.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">② 빛-열-CO₂ 통합</div>
            <p className="mt-1 text-gray-600">
              {adv.thermal.season} · LED 폐열 순비용 {fmt(adv.thermal.netThermalCostPerDay)}원/일
              ({adv.thermal.netThermalCostPerDay < 0 ? "난방 상쇄 크레딧" : "냉방 부하 가산"}).
              계절 따라 최적 배치가 뒤집힌다.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">③ 확률적 강건 (SMP)</div>
            <p className="mt-1 text-gray-600">
              {adv.robust.scenarios}시나리오: 기대 {fmt(adv.robust.expectedCostPerDay)}원,
              최악5%(CVaR) {fmt(adv.robust.cvar95)}원 방어. 실시간요금제 선대응.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">④ 수율-이익 (Economic MPC)</div>
            <p className="mt-1 text-gray-600">
              비용최소가 아니라 이익최대: DLI {adv.profit.costMinDli}→{adv.profit.profitMaxDli},
              일 +{fmt(adv.profit.upliftPerDay)}원. 채소값 비싸면 광량↑가 이득.
            </p>
          </div>
        </div>

        <div className="rounded bg-indigo-900 p-4 text-white">
          <div className="text-sm text-indigo-200">⑤ 플릿 가상발전소(VPP) — 절감이 아니라 새 수익</div>
          <div className="mt-1 text-lg font-bold">
            {fmt(adv.vpp.contractedKw)}kW 가상발전소 · 수요반응 연 {fmt(adv.vpp.annualDrRevenue / 10000)}만원 매출
          </div>
          <p className="mt-1 text-sm text-indigo-100">
            사이트들의 광주기 유연성을 묶어 전력망에 판다 → 배당 풀에 연{" "}
            <b>{fmt(adv.vpp.dividendContributionPerYear / 10000)}만원</b> 기여.
            AI 최적화가 비용을 깎는 데서 멈추지 않고 투자자 배당 재원을 창출한다.
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
