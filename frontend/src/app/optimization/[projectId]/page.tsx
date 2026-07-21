import { prisma } from "@/lib/db";
import {
  optimizeLedSchedule,
  maintenanceRisk,
  seedingPlan,
  nutrientAdvice,
  TARIFF_TOU_GENERAL,
} from "@/lib/optimization";
import { IoTReading } from "@/lib/iot-health";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// AI 운영 최적화 리포트 — 검증에 쓰는 IoT 데이터를 운영 절감에 이중 활용하는 데모.
// 데이터 소스는 seed:opendata(스마트팜코리아 스키마)로 적재된 실데이터 구조.
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

  const iot = await prisma.iotData.findMany({
    where: { projectId },
    orderBy: { recordedAt: "desc" },
    take: 96,
  });

  const readings: IoTReading[] = [...iot].reverse().map((d) => ({
    temperature: d.temperature,
    humidity: d.humidity,
    co2Level: d.co2Level,
    lightIntensity: d.lightIntensity,
    phLevel: d.phLevel,
  }));

  const power = optimizeLedSchedule({
    photoperiodHours: 14,
    ledPowerKw: 4,
    tariff: TARIFF_TOU_GENERAL,
  });
  const maint = readings.length > 0 ? maintenanceRisk(readings) : null;
  const seed = seedingPlan({ monthlySalesForecast: 400 });
  const nutrient =
    readings.length > 0 ? nutrientAdvice(readings[readings.length - 1]) : null;

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const blockLabel = (b: { startHour: number; hours: number }) =>
    `${String(b.startHour).padStart(2, "0")}시~${String((b.startHour + b.hours) % 24).padStart(2, "0")}시 (${b.hours}h)`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">AI 운영 최적화 리포트</h1>
        <p className="text-sm text-gray-500 mt-1">
          {project.name} · 최근 IoT {iot.length}건 기준 · 검증 데이터의 이중 활용
        </p>
      </header>

      <section className="rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold">① 전력비 절감 — 시간대별 요금 연동 광주기</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded bg-gray-50 p-3">
            <div className="text-gray-500">관행 (08시 점등 14h)</div>
            <div className="text-lg font-bold">{fmt(power.baselineCostPerDay)}원/일</div>
            <div className="text-xs text-gray-400">
              {power.baselineBlocks.map(blockLabel).join(" + ")}
            </div>
          </div>
          <div className="rounded bg-emerald-50 p-3">
            <div className="text-emerald-700">AI 최적 스케줄</div>
            <div className="text-lg font-bold text-emerald-700">
              {fmt(power.optimizedCostPerDay)}원/일
            </div>
            <div className="text-xs text-emerald-600">
              {power.optimizedBlocks.map(blockLabel).join(" + ")}
            </div>
          </div>
        </div>
        <p className="text-sm">
          절감 <b>{fmt(power.savingPerDay)}원/일</b> = 월{" "}
          <b className="text-emerald-700">{fmt(power.savingPerMonth)}원</b> (
          {(power.savingRate * 100).toFixed(1)}%) — 낮 할인(11~15시)·심야 경부하로
          광주기를 이동. 실내팜은 광주기를 옮길 수 있는 유일한 농업이다.
        </p>
      </section>

      <section className="rounded-lg border p-5 space-y-2">
        <h2 className="font-semibold">② 관리비 절감 — 예지보전</h2>
        {maint ? (
          <>
            <p className="text-sm">
              드리프트 리스크 <b>{maint.riskScore}σ</b>
              {maint.driftingSensors.length > 0 && (
                <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  {maint.driftingSensors.map((d) => `${d.sensor} ${d.drift}σ`).join(", ")}
                </span>
              )}
            </p>
            <p className="text-sm text-gray-600">{maint.recommendation}</p>
            <p className="text-xs text-gray-400">
              긴급 출동을 계획 방문으로 전환해 기사 1명이 담당하는 사이트 수(밀도 경제)를 높인다.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">IoT 데이터 없음 — seed:opendata 실행 필요</p>
        )}
      </section>

      <section className="rounded-lg border p-5 space-y-2">
        <h2 className="font-semibold">③ 자원 소비 최적화</h2>
        <p className="text-sm">{seed.note}</p>
        {nutrient && (
          <p className="text-sm">
            <span
              className={
                nutrient.status === "ok" ? "text-emerald-700" : "text-amber-700"
              }
            >
              {nutrient.message}
            </span>
          </p>
        )}
      </section>

      <footer className="text-xs text-gray-400">
        데이터: 스마트팜코리아 오픈데이터 스키마 (실 API 전환 지점: src/lib/opendata.ts) ·
        요금표: 2026.4 한전 시간대별 요금 개편 구조 (근사치, 계약종별 교체 지점) ·
        절감치는 1호점 실측 전까지 상방 참고치
      </footer>
    </main>
  );
}
