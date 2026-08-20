import { prisma } from "@/lib/db";
import { buildOptimizationReport } from "@/lib/optimization-report";
import { growthRecipeDemo } from "@/lib/growth-recipe-advanced";
import { fetchSalesData, fetchOpenData, alignExternalSeries } from "@/lib/opendata";
import { IoTReading } from "@/lib/iot-health";
import { notFound } from "next/navigation";
import fleetBaseline from "../../../../prisma/fleet-baseline.json";

export const dynamic = "force-dynamic";

// AI 운영 최적화 리포트 — 미시(알고리즘)·중간(아키텍처)·거시(재무) 3층.
// 데이터: 스마트팜코리아 그린씨에스 실측 온실 환경 시계열.
// 계산은 buildOptimizationReport 한 곳에서만 한다 — /api/optimization/[id]와 같은 숫자.
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

  const [sales, envRecs] = await Promise.all([fetchSalesData(), fetchOpenData()]);
  const external = alignExternalSeries(iot, envRecs);

  const report = buildOptimizationReport({
    projectId: project.id,
    projectName: project.name,
    readings,
    sampleHours: iot.map((d) => d.recordedAt.getHours()),
    externalTempC: external.extTemp,
    externalInsolationWm2: external.extInsolation,
    salesUnits: sales.map((s) => s.units),
    envRecords: envRecs.map((r) => ({ measDt: r.measDt, extTemp: r.extTemp ?? null })),
    fleetPrior: fleetBaseline.tempDiff,
  });
  const {
    crop,
    micro,
    meso,
    macro,
    planning,
    verification,
    advanced: adv,
    unified,
    dataAvailability,
  } = report;
  const { dli, feedback, peak, joint, forecast, seeding, newsvendor, recipeMix, nutrient } = micro;
  const { maintenance, rawCusum, weatherCusum, multivariate, portfolio, contextual, rul } = meso;
  const { cycleDli, contractPower, co2Light } = planning;
  const { backtest, adherence, paramSummary } = verification;
  const savings = macro.savings;

  // 생육레시피 분석 — 환경↔수율 학습으로 최적 목표(레시피)를 도출 (최적화의 입력)
  const recipe = growthRecipeDemo(crop.key);

  const driftDetected = rawCusum.filter((c) => c.detected);
  const driftUnjudged = rawCusum.filter((c) => c.status !== "ok");
  const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

  return (
    <main className="mx-auto max-w-panel px-8 py-10 space-y-6">
      <header>
        <h1 className="text-24 font-bold text-ink">AI 운영 최적화 리포트</h1>
        <p className="mt-2 text-13 text-muted">
          {project.name} · {crop.label} · 실측 IoT {report.inputs.iotRecords}건 (스마트팜코리아 그린씨에스, 10농가 플릿)
        </p>
      </header>

      {/* 거시: 재무 요약 (맨 위 — 투자자/심사 관점) */}
      <section className="rounded-lg border border-brand bg-brand-soft p-5">
        <div className="text-sm text-brand">거시 · 재무 환산 (사이트당)</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-bold text-brand">
            월 {fmt(savings.monthlyWonSaved)}원
          </span>
          <span className="text-brand">
            + CO₂ {savings.monthlyCo2SavedKg}kg/월 · 연 {fmt(savings.annualWonSaved)}원
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {savings.breakdown.map((b) => (
            <span key={b.lever} className="rounded bg-white px-2 py-1 text-brand">
              {b.lever} {fmt(b.wonPerMonth)}원
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-brand">
          {savings.note} · 이 숫자가 투자자 화면·모집 자료·ESG 리포트에 연결된다.
        </p>
        <p className="mt-1 text-xs text-brand">
          신뢰도 판정: {dataAvailability.confidenceReason} · 파라미터 {paramSummary.total}개 중
          가정 {paramSummary.byBasis["가정"]}개({Math.round(paramSummary.assumedShare * 100)}%)
        </p>
      </section>

      {/* 검증: 백테스트 + 실행 준수 */}
      <section className="rounded-lg border border-line bg-surface p-5 space-y-3">
        <h2 className="font-semibold text-body">검증 · 이 숫자를 어떻게 확인했나</h2>
        <p className="text-xs text-body">
          절감액은 &quot;관행이라면 이랬을 것&quot; 대비 반사실이고, 그 관행도 우리가 정한 가정(08시 점등)이다.
          최소한 보유한 과거 구간에서는 얼마였는지 되짚어야 주장이 선다.
        </p>
        {backtest && backtest.completeDays > 0 ? (
          <>
            <div className="grid gap-2 sm:grid-cols-4 text-sm">
              <div className="rounded bg-white p-3">
                <div className="text-xs text-body">검증 일수</div>
                <div className="font-bold">{backtest.completeDays}일</div>
                <div className="text-xs text-muted">제외 {backtest.skippedDays}일(표본 부족)</div>
              </div>
              <div className="rounded bg-white p-3">
                <div className="text-xs text-body">일 절감 중앙값</div>
                <div className="font-bold text-brand">{fmt(backtest.medianSavingPerDay)}원</div>
                <div className="text-xs text-muted">평균 {fmt(backtest.meanSavingPerDay)}원</div>
              </div>
              <div className="rounded bg-white p-3">
                <div className="text-xs text-body">하위 10% 날</div>
                <div className="font-bold text-muted">{fmt(backtest.p10SavingPerDay)}원</div>
                <div className="text-xs text-muted">절감 없던 날 {backtest.nonPositiveDays}일</div>
              </div>
              <div className="rounded bg-white p-3">
                <div className="text-xs text-body">최적 시작시각</div>
                <div className="font-bold">{backtest.startHourSpread}가지</div>
                <div className="text-xs text-muted">
                  {backtest.startHourSpread <= 2 ? "고정 스케줄로 충분" : "일별 재계산 필요"}
                </div>
              </div>
            </div>
            <p className="text-xs text-body">{backtest.note}</p>
          </>
        ) : (
          <p className="text-sm text-body">백테스트 가능한 완전한 날이 없다 — 시간 표본 확보 후 재계산.</p>
        )}
        <div className="rounded bg-white p-3 text-sm">
          <div className="font-medium text-body">실행 준수</div>
          <p className="mt-1 text-body">{adherence.note}</p>
          <p className="mt-1 text-xs text-muted">
            이 지표 없이는 &quot;AI가 절감했다&quot;와 &quot;운영자가 안 따랐다&quot;를 구분할 수 없다.
            제어 이력이 붙으면 신뢰도가 자동으로 measured로 올라간다.
          </p>
        </div>
      </section>

      {/* 미시: 알고리즘 */}
      <section className="rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold">미시 · 알고리즘</h2>

        <div className="rounded bg-surface p-3 text-sm">
          <div className="font-medium">① DLI 광주기 (농학 제약 + TOU + 탄소)</div>
          <p className="mt-1">
            {crop.label} 목표 DLI {dli.dliTarget} → 연속 명기 {dli.requiredHours}h(PPFD {dli.ppfdUsed},
            {" "}{dli.ledPowerKwUsed}kW) + 연속 암기 {dli.darkContinuousH}h, 달성 {dli.achievedDli} mol.
            관행 {fmt(dli.naiveCostPerDay)} → 최저요금·저탄소 배치 {fmt(dli.costPerDay)}원/일 —
            월 <b className="text-brand">{fmt(dli.savingPerMonth)}원 + CO₂ {dli.co2SavedKgPerMonth}kg</b>.
            {feedback && <> 닫힌루프: {feedback.action}</>}
          </p>
          <p className="mt-1 text-xs text-muted">
            {dli.photoperiodSafe
              ? "추대·생체리듬 하드제약 충족 — 빛을 싼 시간마다 흩뿌리지 않고 연속 블록으로만 배치한다."
              : `연속 암기 ${dli.darkContinuousH}h로 최소 기준 미달 — 목표 DLI 하향 또는 광량 증설 필요.`}
            {!dli.feasible && " 정격 PPFD 초과 — 시설 광량 재설계 지점."}
          </p>
        </div>

        <div className="rounded bg-sky-50 p-3 text-sm">
          <div className="font-medium text-sky-800">② 피크 분산 + SA 통합</div>
          <p className="mt-1 text-sky-700">
            동시가동 {peak.naivePeakKw}kW → {peak.optimizedPeakKw}kW
            {contractPower.demandMetered
              ? `, 기본요금 월 ${fmt(peak.demandChargeSavingIfMeteredPerMonth)}원.`
              : `. 계약전력 ${contractPower.currentKw}kW는 최대수요전력 계량 대상이 아니라 기본요금 절감은 0원 — 피크 분산은 설비 용량·광량 배분 제약으로만 쓴다.`}{" "}
            SA 전역탐색이 단계별 해 대비 월 {fmt(joint.improvementPerMonth)}원 추가 절감
            (전력량요금과 겹치므로 위 합계엔 넣지 않는다).
          </p>
        </div>

        <div className="rounded bg-violet-50 p-3 text-sm">
          <div className="font-medium text-violet-800">④ 수요예측(Holt-Winters) → ⑤ 작물믹스(톰슨샘플링)</div>
          <p className="mt-1 text-violet-700">
            판매 {report.inputs.salesRecords}일 학습 → 30일 {fmt(forecast.monthlyTotal)}포기 예측
            {micro.forecastInterval.interval.valid && (
              <>
                {" "}(14일 구간 ±{micro.forecastInterval.interval.halfWidth}/일,{" "}
                {Math.round(micro.forecastInterval.interval.achievedCoverage * 100)}% 커버리지)
              </>
            )}
            . {seeding.note}
          </p>
          <p className="mt-1 text-violet-700">
            뉴스벤더 파종: <b>{newsvendor.recommendedUnits}포기</b> (결정론 {newsvendor.deterministicUnits}포기,
            임계 분위수 {Math.round(newsvendor.criticalFractile * 100)}%) — {newsvendor.note}
          </p>
          <p className="mt-1 text-violet-700">
            품종/레시피 밴딧: {recipeMix.allocation.map((a) => `${a.name} ${Math.round(a.share * 100)}%`).join(" · ")}
            (균등 대비 기대마진 +{((recipeMix.uplift / recipeMix.uniformTotalMargin) * 100).toFixed(1)}%).
          </p>
          {recipeMix.synthetic && (
            <p className="mt-1 text-xs text-violet-500">
              ※ 밴딧 상승분은 가정한 품종별 마진에 기반한 시뮬레이션 — 1호점 수확·판매 실적이 쌓이면 실측으로 대체된다.
            </p>
          )}
          {nutrient && (
            <p
              className={`mt-1 text-xs ${nutrient.status === "unavailable" ? "text-muted" : "text-violet-600"}`}
            >
              {nutrient.message}
            </p>
          )}
        </div>
      </section>

      {/* 중간: 아키텍처 */}
      <section className="rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold">중간 · 아키텍처 (플릿 학습)</h2>
        <div className="rounded bg-surface p-3 text-sm">
          <div className="font-medium text-muted">③ 외부기상 차분 CUSUM + 플릿 콜드스타트</div>
          <p className="mt-1 text-muted">
            원시 CUSUM은 계절 하강을 설비 드리프트로 오탐
            ({driftDetected.length > 0
              ? driftDetected.map((c) => `${c.sensor} ${c.maxStatistic}σ`).join(", ")
              : "이번 창엔 없음"}).
            {" "}외부기상 차분 → {weatherCusum.status === "ok" ? `${weatherCusum.maxStatistic}σ, ` : ""}
            {weatherCusum.note}
          </p>
          {driftUnjudged.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              판정 보류: {driftUnjudged.map((c) => `${c.sensor}(${c.status})`).join(", ")} —
              센서 값이 굵게 양자화돼 산포 추정이 성립하지 않는 구간. 관리도를 억지로 돌리는 대신 보류한다.
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            플릿 {fleetBaseline.meta.farms}농가 {fmt(fleetBaseline.meta.rows)}건 베이스라인을 신규 사이트
            CUSUM 사전분포로 사용 → 이력 없는 1호점도 첫날부터 판정 (teacher-student 콜드스타트).
            예지보전 리스크 {maintenance?.riskScore ?? "—"}σ →{" "}
            <b className={rul.action === "urgent" ? "text-danger" : rul.action === "schedule" ? "text-muted" : "text-brand"}>
              잔여수명 ~{rul.estimatedRulDays}일 ({rul.action})
            </b>{" "}
            — 베이불 생존분석으로 &quot;이상함&quot;을 실행가능한 잔여수명(RUL)으로 격상.
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
          <p className="mt-2 text-teal-700">
            <b>문맥 밴딧(LinUCB)</b>: {contextual.armShares.map((a) => `${a.name} ${Math.round(a.share * 100)}%`).join(" · ")}
            {" "}— {contextual.note}
          </p>
        </div>
        <div className="rounded bg-rose-50 p-3 text-sm">
          <div className="font-medium text-rose-800">다변량 관리도(MEWMA) — 센서 간 관계 붕괴</div>
          <p className="mt-1 text-rose-700">
            {multivariate.status === "ok"
              ? multivariate.note
              : `판정 보류 (${multivariate.status}) — ${multivariate.note}`}
          </p>
          <p className="mt-1 text-xs text-rose-500">
            센서별 CUSUM은 각 축을 따로 본다. 온도도 습도도 각각은 정상범위인데 둘의 관계가 평소와
            다른 상황(제습 실패·순환 정지)은 공분산 거리로만 잡힌다.
          </p>
        </div>
      </section>

      {/* 계획 계층 */}
      <section className="rounded-lg border border-cyan-200 bg-cyan-50 p-5 space-y-3">
        <h2 className="font-semibold text-cyan-900">계획 · 하루 단위가 못 쓰는 자유도</h2>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded bg-white p-3">
            <div className="font-medium">사이클 광량 배분</div>
            <p className="mt-1 text-muted">
              {cycleDli.days.length}일 누적 {cycleDli.targetCumulativeDli} mol을 요금 싼 날에 몰아 배분
              (하루 {cycleDli.dailyMin}~{cycleDli.dailyMax}). 균등 대비 사이클당{" "}
              <b className="text-brand">{fmt(cycleDli.savingPerCycle)}원</b>.
            </p>
            <p className="mt-1 text-xs text-muted">
              수율은 사이클 누적 광량에 반응하므로 매일 같은 양을 줄 이유가 없다. 연속 배낭 정확해.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">계약전력 · 기본요금</div>
            <p className="mt-1 text-muted">
              계약전력 {contractPower.currentKw}kW · 관측 피크 {contractPower.observedPeakKw}kW ·
              기본요금 월 {fmt(contractPower.basicChargePerMonth)}원 · 피크 절감{" "}
              <b className={contractPower.demandMetered ? "text-brand" : "text-muted"}>
                {fmt(contractPower.savingPerMonth)}원
              </b>
              .
            </p>
            <p className="mt-1 text-xs text-muted">{contractPower.note}</p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">CO₂-광 대체</div>
            <p className="mt-1 text-muted">
              {co2Light.chosen.co2Ppm}ppm · DLI {co2Light.chosen.dli} → 일 이익{" "}
              {fmt(co2Light.chosen.profitPerDay)}원 (시비 없이 광량만: {fmt(co2Light.lightOnly.profitPerDay)}원).
              CO₂ 100ppm이 DLI {co2Light.substitutionDliPer100Ppm} 대체.
            </p>
            <p className="mt-1 text-xs text-muted">
              CO₂를 올리면 광포화점이 올라가 같은 광량으로 더 자란다 — 전기를 덜 사도 되게 만드는 축.
            </p>
          </div>
        </div>
        <p className="text-xs text-cyan-700">{co2Light.note}</p>
      </section>

      {/* 생육레시피 분석 — 최적화의 "목표"를 데이터에서 학습 */}
      <section className="rounded-lg border border-brand bg-brand-soft p-5 space-y-3">
        <h2 className="font-semibold text-brand">AI 생육레시피 분석 — 최적 목표를 데이터에서 학습</h2>
        <p className="text-xs text-brand">
          스케줄링이 &quot;어떻게 싸게 달성할지&quot;라면, 레시피 분석은 &quot;무엇을 목표로 할지&quot;를 정한다.
          환경↔수율 {recipe.samples}개 사이클을 학습해 최적 생육조건을 도출 — 이 레시피가
          최적화 스택의 목표(DLI·정상범위)가 되어 두 시스템이 맞물린다.
        </p>
        <p className="text-xs font-medium text-body bg-surface rounded px-2 py-1">
          ※ 합성 데이터 데모 (실 수율은 1호점 수확기록에서 확정). 반응표면 판정{" "}
          <strong>{recipe.surface}</strong> · 설명력{" "}
          {recipe.modelR2 === null ? "판정 불가(표본 부족)" : `CV R² ${recipe.modelR2}`}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="rounded bg-white p-3">
            <div className="font-medium">특성 중요도 (SHAP 섀플리 값)</div>
            <p className="mt-1 text-body">
              {recipe.shap.slice(0, 4).map((s) => `${s.label} ${Math.round(s.meanAbsShap * 100)}`).join(" · ")}
            </p>
            <p className="mt-1 text-xs text-muted">
              협조게임이론의 공정 기여도. 배경 표본에 대한 개입 방식이라 부분의 합이 예측 차이와 맞는다.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">권장 설정점과 95% 구간</div>
            <ul className="mt-1 space-y-0.5 text-body">
              {recipe.hybrid.map((s) => (
                <li key={s.feature}>
                  {s.label} <strong>{s.hybridOptimum}{s.unit}</strong>{" "}
                  <span className="text-muted">
                    ({s.interval[0]}~{s.interval[1]}{s.unit})
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">
              출처 배분 — 문헌 {recipe.hybrid[0].source.literature}% · 이전{" "}
              {recipe.hybrid[0].source.transfer}% · 자체 데이터 {recipe.hybrid[0].source.own}%
              (온도 기준). 불확실성은 부트스트랩으로 데이터에서 직접 쟀다.
            </p>
          </div>
        </div>

        {/* 갭 분석 — 지금 조건에서 무엇을 먼저 옮길지 */}
        <div className="rounded bg-white p-3 text-sm">
          <div className="font-medium">갭 분석 · 무엇부터 옮길까</div>
          <p className="mt-1 text-body">{recipe.gap.headline}</p>
          {recipe.surface === "최대점" && (
            <table className="mt-2 w-full text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line-soft text-left">
                  <th className="py-1 font-normal">요인</th>
                  <th className="py-1 font-normal">현재</th>
                  <th className="py-1 font-normal">목표</th>
                  <th className="py-1 font-normal">조치</th>
                  <th className="py-1 font-normal text-right">수율 기여</th>
                </tr>
              </thead>
              <tbody>
                {recipe.gap.actions.map((a) => (
                  <tr key={a.label} className="border-b border-line-soft last:border-0">
                    <td className="py-1">
                      {a.label}
                      {a.atBoundary && <span className="ml-1 text-muted">(관측 끝)</span>}
                    </td>
                    <td className="py-1">{a.current}</td>
                    <td className="py-1">{a.target}</td>
                    <td className="py-1">{a.direction}</td>
                    <td className="py-1 text-right">
                      {a.predictedYieldUpliftPct >= 0 ? "+" : ""}
                      {a.predictedYieldUpliftPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-1 text-xs text-muted">
            요인별 기여는 섀플리 분해라 합이 전체 상방({recipe.gap.totalPotentialUpliftPct}%)과 맞는다.
            &quot;관측 끝&quot; 표시는 그 방향으로 더 올릴 여지를 아직 확인하지 못했다는 뜻이다.
          </p>
        </div>

        <div className="rounded bg-surface p-3 text-sm text-body">
          <span className="font-medium">다음 실험 제안</span>
          {recipe.suggestions.length > 0 ? (
            <>
              {" "}
              {recipe.suggestions
                .map((s) => `${s.label}→${s.suggestValue}${s.unit}`)
                .join(" · ")}
              <p className="mt-1 text-xs text-muted">{recipe.suggestNote}</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">{recipe.suggestNote}</p>
          )}
        </div>

        <p className="text-xs text-brand">{recipe.hybridNote}</p>
      </section>

      {/* 캡스톤: 통합 공동최적화 */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-white space-y-3">
        <h2 className="font-semibold">캡스톤 · 통합 공동최적화 (6개 목적을 하나로)</h2>
        <p className="text-sm text-slate-300">
          순차 파이프라인(각 알고리즘이 바통 넘김)이 아니라, <b>단일 목적함수로 전부 동시에 저울질</b>한다.
          결정변수(광량 DLI·광블록 시작)를 전수열거로 함께 탐색하며 수율매출·전력량·기본요금·
          열·CO₂·VPP 유연성을 한 번에 최적화. 광주기 안전은 하드제약, 가격은 강건.
          광량을 올리면 명기를 줄이는 대신 PPFD와 소비전력이 함께 오르므로, DLI 상향은 공짜가 아니다.
        </p>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-bold text-brand">
            순가치 {fmt(unified.netDailyValue)}원/일
          </span>
          <span className="text-slate-300">
            순차 파이프라인 대비 <b className="text-brand">+{fmt(unified.vsSequentialNetValue)}원/일</b>
          </span>
          <span className="text-xs text-slate-400">
            선택 DLI {unified.dliChosen}(PPFD {unified.ppfd}) · 명기 {unified.litHours.length}h / 암기 {unified.darkContinuousH}h
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded bg-slate-800 p-2">
            <div className="text-slate-400">수율매출</div>
            <div className="font-bold text-brand">+{fmt(unified.breakdown.yieldRevenue)}</div>
          </div>
          <div className="rounded bg-slate-800 p-2">
            <div className="text-slate-400">전력+기본+열+CO₂</div>
            <div className="font-bold text-danger">
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
          {dataAvailability.externalTemp === "assumed" && (
            <div className="mt-1 text-muted">
              ※ 실측 외기온도 미확보 — 열 항은 실내 목표온도와 같은 중립 가정(계절 이득/부담 0)으로 계산됐다.
            </div>
          )}
        </div>
      </section>

      {/* 고도화: 5개 돌파 통합 스택 */}
      <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-5 space-y-3">
        <h2 className="font-semibold text-indigo-900">고도화 · 5개 돌파 (통합 최적화의 구성 요소)</h2>
        <p className="text-xs text-indigo-700">{adv.summary.headline}</p>

        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded bg-white p-3">
            <div className="font-medium">① 광주기 안전 (농학 하드제약)</div>
            <p className="mt-1 text-muted">
              명기 {adv.photoperiod.requiredHours}h(PPFD {adv.photoperiod.ppfdUsed},
              {" "}{adv.photoperiod.ledPowerKwUsed}kW) + 연속 암기{" "}
              {adv.photoperiod.darkContinuousH}h → 추대·생체리듬 안전 {adv.photoperiod.safe ? "✓" : "✗"}.
              산란 배치 대비 안전 비용 {fmt(adv.photoperiod.safetyCostPerDay)}원/일.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">② 빛-열-CO₂ 통합</div>
            <p className="mt-1 text-muted">
              {adv.thermal.season} · LED 폐열 순비용 {fmt(adv.thermal.netThermalCostPerDay)}원/일
              ({adv.thermal.netThermalCostPerDay < 0 ? "난방 상쇄 크레딧" : "냉방 부하 가산"}).
              계절 따라 최적 배치가 뒤집힌다.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">③ 확률적 강건 (SMP)</div>
            <p className="mt-1 text-muted">
              {adv.robust.scenarios}시나리오: 기대 {fmt(adv.robust.expectedCostPerDay)}원,
              최악5%(CVaR) {fmt(adv.robust.cvar95)}원 방어. 실시간요금제 선대응.
            </p>
          </div>
          <div className="rounded bg-white p-3">
            <div className="font-medium">④ 수율-이익 (Economic MPC)</div>
            <p className="mt-1 text-muted">
              비용최소가 아니라 이익최대: DLI {adv.profit.costMinDli}→{adv.profit.profitMaxDli},
              일 +{fmt(adv.profit.upliftPerDay)}원. 광주기·정격이 허용하는 상한은 DLI {adv.profit.maxFeasibleDli}.
            </p>
          </div>
        </div>

        <div className="rounded bg-indigo-900 p-4 text-white">
          <div className="text-sm text-indigo-200">⑤ 플릿 가상발전소(VPP) — 절감이 아니라 새 수익</div>
          <div className="mt-1 text-lg font-bold">
            {fmt(adv.vpp.contractedKw)}kW 가상발전소 · 수요반응 연{" "}
            <span title="플릿 전체 합산">{fmt(adv.vpp.annualDrRevenue / 10000)}만원</span> 매출
            <span className="ml-2 text-sm font-normal text-indigo-300">
              (플릿 {adv.vpp.sites}사이트 전체 / 사이트당{" "}
              {Math.round(adv.vpp.annualDrRevenuePerSite / 1000) / 10}만원)
            </span>
          </div>
          <p className="mt-1 text-sm text-indigo-100">
            사이트들의 광주기 유연성을 묶어 전력망에 판다 → 회수 재원에 연{" "}
            <b title="플릿 전체 합산">{fmt(adv.vpp.dividendContributionPerYear / 10000)}만원</b> 기여
            <span className="text-indigo-300">
              {" "}(사이트당 {Math.round(adv.vpp.dividendPerSitePerYear / 1000) / 10}만원 · 규모에 비례)
            </span>.{" "}
            AI 최적화가 비용을 깎는 데서 멈추지 않고 투자자 회수 재원을 만든다.
          </p>
        </div>
      </section>

      <footer className="text-xs text-muted">
        데이터: 스마트팜코리아 정형 데이터셋(그린씨에스 dtaSn=13) 실측 · 알고리즘 근거:
        arXiv 2410.23793(Economic MPC)·2506.13278(RL-MPC 외란보상)·2504.20815(teacher-student)·
        2512.01167(LED 피드백)·2101.06592(제약하 밴딧) · 절감치는 1호점 실측 전 상방 참고치
      </footer>
    </main>
  );
}
