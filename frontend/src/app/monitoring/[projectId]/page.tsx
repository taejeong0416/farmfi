"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import {
  SENSOR_META,
  type SensorKey,
  type GrowthMonitoringResult,
  type MonitoringPoint,
  type DailyMetric,
} from "@/lib/growth-monitoring";
import styles from "./Monitoring.module.css";

interface MonitoringResponse extends GrowthMonitoringResult {
  project: { id: string; name: string };
  days: number;
}

const RANGES = [
  { days: 1, label: "24시간" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
];

const CHART_SENSORS: SensorKey[] = [
  "temperature",
  "humidity",
  "co2Level",
  "phLevel",
  "lightIntensity",
];

async function fetchMonitoring(
  projectId: string,
  days: number
): Promise<MonitoringResponse> {
  const res = await fetch(`/api/monitoring/${projectId}?days=${days}`);
  if (!res.ok) throw new Error("모니터링 데이터를 불러오지 못했습니다");
  return res.json();
}

// 30일(1,440점)은 커스텀 dot 렌더가 무거워 표시용으로 다운샘플하되
// 이상치(스파이크)는 절대 버리지 않는다 — 이상신호가 화면에서 사라지면 안 된다.
function downsample(points: MonitoringPoint[], max = 420): MonitoringPoint[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((p, i) => i % step === 0 || p.isAnomaly);
}

function fmtTime(ts: number, days: number): string {
  const d = new Date(ts);
  if (days > 2) {
    return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function MonitoringPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  const [days, setDays] = useState(7);

  const query = useQuery({
    queryKey: ["monitoring", projectId, days],
    queryFn: () => fetchMonitoring(projectId as string, days),
    enabled: Boolean(projectId),
    refetchInterval: 20_000,
    retry: 1,
  });

  const data = query.data;

  const events = useMemo(() => {
    if (!data) return [];
    const spikeEvents = data.points
      .filter((p) => p.isAnomaly)
      .map((p) => ({
        ts: p.ts,
        t: p.t,
        kind: "spike" as const,
        desc: `${p.affectedSensors
          .map((s) => SENSOR_META[s].label)
          .join(", ")} 급변 (${p.anomalyScore.toFixed(1)}σ)`,
        color: "#A34A3D",
      }));
    const driftEvents = data.drift
      .filter((d) => d.detected && d.detectedAt)
      .map((d) => ({
        ts: new Date(d.detectedAt as string).getTime(),
        t: d.detectedAt as string,
        kind: "drift" as const,
        desc: `${SENSOR_META[d.sensor].label} 지속 드리프트 시작 (CUSUM ${d.maxStatistic}σ)`,
        color: "#8A8A8A",
      }));
    // 광량 미달은 시점 이벤트가 아니라 구간 현상이라, 미달로 돌아선 첫 생육일을 세운다.
    const under = data.daily.filter((d) => d.complete && d.dliRatio < 0.9);
    const lightEvents =
      under.length > 0
        ? [
            {
              ts: under[0].ts,
              t: under[0].day,
              kind: "light" as const,
              desc: `일적산광량 목표 미달 시작 (${Math.round(
                under[0].dliRatio * 100
              )}%) · 이후 ${under.length}일 지속`,
              color: "#8A8A8A",
            },
          ]
        : [];
    return [...spikeEvents, ...driftEvents, ...lightEvents]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }, [data]);

  if (!projectId) {
    return <div className={styles.error}>프로젝트를 찾을 수 없습니다.</div>;
  }
  if (query.isLoading) {
    return <div className={styles.loading}>생육 데이터를 분석하는 중…</div>;
  }
  if (query.isError || !data) {
    return (
      <div className={styles.error}>
        데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  const { summary, drift, light, harvest } = data;
  const driftMap = new Map(drift.map((d) => [d.sensor, d]));
  const isDemo = summary.count === 0;
  const uptimeTone =
    summary.uptimeRate >= 98 ? "good" : summary.uptimeRate >= 90 ? "warn" : "bad";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <div className={styles.crumb}>
            <span>FARMFI</span>
            <span>/</span>
            <strong>생육 모니터링</strong>
          </div>
          <Link className={styles.back} href={`/projects/${data.project.id}`}>
            ← 프로젝트로
          </Link>
        </div>

        <div className={styles.head}>
          <h1>실시간 생육 환경 모니터링</h1>
          <p>
            {data.project.name} · {harvest.cropLabel} 기준. 5개 환경 센서를 실시간
            시각화하고, 급변·드리프트·설비고장을 자동 판정합니다. 광량은 순간값이
            아니라 일적산(DLI)으로, 생장은 적산온도(GDD)로 판정합니다.
          </p>
        </div>

        <div className={styles.controls}>
          <div className={styles.rangeTabs}>
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                className={days === r.days ? styles.active : ""}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className={`${styles.live} ${isDemo ? styles.demo : ""}`}>
            <i /> {isDemo ? "데이터 없음" : "실시간 · 20초 갱신"}
          </span>
        </div>

        <div className={styles.statGrid}>
          <div className={`${styles.stat} ${styles[uptimeTone]}`}>
            <small>설비 가동률</small>
            <strong>
              {summary.uptimeRate.toFixed(1)}
              <em>%</em>
            </strong>
          </div>
          <div
            className={`${styles.stat} ${
              summary.anomalyCount > 0 ? styles.warn : styles.good
            }`}
          >
            <small>급변 탐지 (Z&gt;3σ)</small>
            <strong>
              {summary.anomalyCount}
              <em>건</em>
            </strong>
          </div>
          <div
            className={`${styles.stat} ${
              summary.driftSensors.length > 0 ? styles.bad : styles.good
            }`}
          >
            <small>드리프트 센서</small>
            <strong>
              {summary.driftSensors.length}
              <em>개</em>
            </strong>
          </div>
          <div
            className={`${styles.stat} ${
              summary.suboptimalCount > 0 ? styles.warn : styles.good
            }`}
          >
            <small>최적대 이탈</small>
            <strong>
              {summary.count > 0
                ? ((summary.suboptimalCount / summary.count) * 100).toFixed(1)
                : "0.0"}
              <em>%</em>
            </strong>
          </div>
        </div>

        <div className={styles.growthGrid}>
          <DliPanel daily={data.daily} light={light} />
          <HarvestPanel harvest={harvest} daily={data.daily} />
        </div>

        <div className={styles.chartGrid}>
          {CHART_SENSORS.map((sensor) => (
            <SensorChart
              key={sensor}
              sensor={sensor}
              points={data.points}
              optimal={data.optimalRanges[sensor]}
              gate={data.healthyRanges[sensor]}
              drift={driftMap.get(sensor)}
              days={days}
            />
          ))}
        </div>

        <div className={styles.events}>
          <h3>최근 이상 이벤트</h3>
          {events.length === 0 ? (
            <p className={styles.empty}>
              탐지된 이상 이벤트가 없습니다. 전체 센서가 안정적입니다.
            </p>
          ) : (
            events.map((e, i) => (
              <div className={styles.eventRow} key={`${e.kind}-${e.ts}-${i}`}>
                <span
                  className={styles.eventDot}
                  style={{ background: e.color }}
                />
                <span className={styles.eventTime}>
                  {new Date(e.t).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className={styles.eventDesc}>{e.desc}</span>
              </div>
            ))
          )}
        </div>

        <div className={styles.footnote}>
          <b>판정 방식</b> — ① <b>Z-score</b>: 윈도우 평균 대비 3σ 초과 단발
          급변(빨간 점). ② <b>CUSUM 관리도</b>: 24시간 계절차분 + MAD 강건추정으로
          지속 드리프트의 <i>시작 시점</i>까지 특정(주황 세로선). ③ <b>2단 밴드</b>:
          엽채류 농학 최적대(초록 밴드) 이탈은 주의, 여기서 더 넓힌 설비 고장
          게이트(빨간 점선) 이탈은 현장 점검 대상 — 제어루프가 스스로 되돌리는 편차와
          액추에이터가 못 따라가는 고장을 같은 경고로 묶지 않습니다. ④ <b>DLI</b>:
          광량은 순간 조도로 판정하지 않습니다. 최적화가 요금이 싼 시간대로 광주기를
          옮기면 심야 점등과 높은 순간 조도가 모두 정상 운영이 되고, 반대로 LED가
          서서히 열화하는 진짜 고장은 어떤 절대 상한에도 걸리지 않기 때문입니다.
          ⑤ <b>GDD</b>: 적산온도로 현 사이클 진행률과 수확 예정일을 추정하며, 광량
          부족분만큼 진행 속도를 할인합니다.
        </div>
      </div>
    </main>
  );
}

// ── 일적산광량(DLI) 패널 ─────────────────────────────────────────────────────
function DliPanel({
  daily,
  light,
}: {
  daily: DailyMetric[];
  light: GrowthMonitoringResult["light"];
}) {
  const bars = useMemo(() => daily.filter((d) => d.complete).slice(-21), [daily]);
  const tone =
    light.status === "ok" ? "good" : light.status === "under" ? "bad" : "warn";

  return (
    <div className={`${styles.growthCard} ${styles[tone]}`}>
      <div className={styles.growthHead}>
        <h3>일적산광량 (DLI)</h3>
        <span className={styles.growthNow}>
          {light.recentDli.toFixed(1)}
          <em> / {light.dliTarget} mol</em>
        </span>
      </div>
      <div className={styles.ratioRow}>
        <div className={styles.ratioBar}>
          <i style={{ width: `${Math.min(130, light.ratioPct)}%` }} />
          <span style={{ left: "100%" }} />
        </div>
        <b>{light.ratioPct}%</b>
      </div>
      {bars.length > 0 && (
        <div className={styles.miniChart}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#F2F2F0" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={fmtDay}
                tick={{ fontSize: 9, fill: "#8A8A8A" }}
                minTickGap={24}
                stroke="#E5E5E3"
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#8A8A8A" }}
                width={30}
                stroke="#E5E5E3"
              />
              <ReferenceLine
                y={light.dliTarget}
                stroke="#14542E"
                strokeDasharray="4 3"
                label={{
                  value: "목표",
                  position: "insideTopRight",
                  fontSize: 9,
                  fill: "#14542E",
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as DailyMetric;
                  return (
                    <div className={styles.tooltip}>
                      <div className={styles.tHead}>{fmtDay(d.ts)} 생육일</div>
                      <div>
                        DLI {d.dli.toFixed(1)} mol ({Math.round(d.dliRatio * 100)}%)
                      </div>
                      <div>명기 {d.litHours.toFixed(1)}h</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="dli" radius={[2, 2, 0, 0]}>
                {bars.map((d) => (
                  <Cell
                    key={d.ts}
                    fill={d.dliRatio < 0.9 ? "#8A8A8A" : "#8A8A8A"}
                    fillOpacity={d.dliRatio < 0.9 ? 0.55 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className={styles.growthMsg}>{light.message}</p>
    </div>
  );
}

// ── 수확 예측(GDD) 패널 ──────────────────────────────────────────────────────
function HarvestPanel({
  harvest,
  daily,
}: {
  harvest: GrowthMonitoringResult["harvest"];
  daily: DailyMetric[];
}) {
  const curve = useMemo(() => daily.slice(-30), [daily]);
  const tone =
    harvest.delayDays == null
      ? "warn"
      : harvest.delayDays >= 1
        ? "bad"
        : harvest.delayDays <= -1
          ? "warn"
          : "good";

  return (
    <div className={`${styles.growthCard} ${styles[tone]}`}>
      <div className={styles.growthHead}>
        <h3>수확 예측 (적산온도)</h3>
        <span className={styles.growthNow}>
          {harvest.daysRemaining != null ? `D-${Math.ceil(harvest.daysRemaining)}` : "–"}
        </span>
      </div>
      <div className={styles.ratioRow}>
        <div className={styles.ratioBar}>
          <i
            className={styles.gddFill}
            style={{ width: `${Math.min(100, harvest.gddProgressPct)}%` }}
          />
        </div>
        <b>{harvest.gddProgressPct}%</b>
      </div>
      <div className={styles.kvRow}>
        <div>
          <small>누적 GDD</small>
          <span>
            {harvest.accumulatedGdd} <em>/ {harvest.targetGdd}</em>
          </span>
        </div>
        <div>
          <small>사이클 경과</small>
          <span>
            {harvest.cycleElapsedDays}
            <em> 일</em>
          </span>
        </div>
        <div>
          <small>유효 적산속도</small>
          <span>
            {harvest.effectiveGddPerDay}
            <em> ℃·d/일</em>
          </span>
        </div>
      </div>
      {curve.length > 1 && (
        <div className={styles.miniChart}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curve} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#F2F2F0" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={fmtDay}
                tick={{ fontSize: 9, fill: "#8A8A8A" }}
                minTickGap={24}
                stroke="#E5E5E3"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: "#8A8A8A" }}
                width={30}
                stroke="#E5E5E3"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as DailyMetric;
                  return (
                    <div className={styles.tooltip}>
                      <div className={styles.tHead}>{fmtDay(d.ts)}</div>
                      <div>생장 진행 {d.growthRate.toFixed(1)}%</div>
                      <div>
                        평균 {d.avgTemp}°C · GDD {d.gdd}
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="growthRate"
                stroke="#14542E"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className={styles.growthMsg}>{harvest.message}</p>
    </div>
  );
}

function SensorChart({
  sensor,
  points,
  optimal,
  gate,
  drift,
  days,
}: {
  sensor: SensorKey;
  points: MonitoringPoint[];
  optimal: [number, number];
  gate: [number, number];
  drift?: { detected: boolean; detectedAt: string | null; maxStatistic: number };
  days: number;
}) {
  const meta = SENSOR_META[sensor];
  const display = useMemo(() => downsample(points), [points]);
  const isLux = sensor === "lightIntensity";
  const [lo, hi] = optimal;
  const [gLo, gHi] = gate;

  const latest = points.length ? points[points.length - 1][sensor] : 0;
  const hasSpike = points.some(
    (p) => p.isAnomaly && p.affectedSensors.includes(sensor)
  );
  const hasDrift = Boolean(drift?.detected);
  const last = points.length ? points[points.length - 1] : null;
  const latestFault = Boolean(last?.outOfRange.includes(sensor));
  const latestSuboptimal = Boolean(last?.outOfOptimal.includes(sensor));

  const yDomain = useMemo<[number, number]>(() => {
    const vals = points.map((p) => p[sensor]);
    const dMin = vals.length ? Math.min(...vals) : lo;
    const dMax = vals.length ? Math.max(...vals) : hi;
    if (isLux) {
      const top = Math.max(dMax, hi) * 1.05;
      return [0, Math.round(top)];
    }
    const min = Math.min(dMin, lo);
    const max = Math.max(dMax, hi);
    const pad = (max - min) * 0.08 || 1;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [points, sensor, lo, hi, isLux]);

  const driftTs = drift?.detectedAt
    ? new Date(drift.detectedAt).getTime()
    : null;

  const fmtVal = (v: number) =>
    isLux ? `${(v / 1000).toFixed(1)}k` : v.toFixed(sensor === "phLevel" ? 1 : 0);

  return (
    <div className={`${styles.card} ${hasSpike || hasDrift ? styles.alert : ""}`}>
      <div className={styles.cardHead}>
        <h3>{meta.label}</h3>
        <span className={styles.now}>
          {fmtVal(latest)}
          <em>{meta.unit}</em>
        </span>
      </div>
      <div className={styles.badges}>
        {!hasSpike && !hasDrift && !latestFault && !latestSuboptimal && (
          <span className={`${styles.badge} ${styles.ok}`}>정상</span>
        )}
        {hasSpike && (
          <span className={`${styles.badge} ${styles.spike}`}>급변 탐지</span>
        )}
        {hasDrift && (
          <span className={`${styles.badge} ${styles.drift}`}>
            드리프트 {drift?.maxStatistic}σ
          </span>
        )}
        {latestSuboptimal && !latestFault && (
          <span className={`${styles.badge} ${styles.suboptimal}`}>최적대 이탈</span>
        )}
        {latestFault && (
          <span className={`${styles.badge} ${styles.range}`}>설비 이상</span>
        )}
        {isLux && (
          <span className={`${styles.badge} ${styles.info}`}>DLI로 판정</span>
        )}
      </div>

      <div className={styles.chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={display}
            margin={{ top: 6, right: 8, bottom: 0, left: -8 }}
          >
            <CartesianGrid stroke="#F2F2F0" vertical={false} />
            {!isLux && (
              <>
                <ReferenceArea
                  y1={lo}
                  y2={hi}
                  fill="#14542E"
                  fillOpacity={0.07}
                  stroke="none"
                />
                <ReferenceLine y={gLo} stroke="#A34A3D" strokeDasharray="3 4" strokeOpacity={0.5} />
                <ReferenceLine y={gHi} stroke="#A34A3D" strokeDasharray="3 4" strokeOpacity={0.5} />
              </>
            )}
            {driftTs && (
              <ReferenceLine
                x={driftTs}
                stroke="#8A8A8A"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                label={{
                  value: "드리프트",
                  position: "top",
                  fontSize: 10,
                  fill: "#8A8A8A",
                }}
              />
            )}
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => fmtTime(v, days)}
              tick={{ fontSize: 10, fill: "#8A8A8A" }}
              minTickGap={40}
              stroke="#E5E5E3"
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 10, fill: "#8A8A8A" }}
              tickFormatter={fmtVal}
              width={38}
              stroke="#E5E5E3"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as MonitoringPoint;
                const spike = p.affectedSensors.includes(sensor);
                return (
                  <div className={styles.tooltip}>
                    <div className={styles.tHead}>
                      {new Date(p.ts).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div>
                      {meta.label}: {fmtVal(p[sensor])}
                      {meta.unit}
                    </div>
                    {spike && (
                      <div className={styles.tSpike}>
                        ⚠ 급변 {p.anomalyScore.toFixed(1)}σ
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey={sensor}
              stroke={meta.color}
              strokeWidth={1.6}
              isAnimationActive={false}
              dot={(props: any) => {
                const p = props.payload as MonitoringPoint;
                if (p.isAnomaly && p.affectedSensors.includes(sensor)) {
                  return (
                    <circle
                      key={`d-${p.ts}`}
                      cx={props.cx}
                      cy={props.cy}
                      r={3.5}
                      fill="#A34A3D"
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  );
                }
                return <g key={`d-${p.ts}`} />;
              }}
              activeDot={{ r: 4, fill: meta.color }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
