"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
        color: "#e05a3a",
      }));
    const driftEvents = data.drift
      .filter((d) => d.detected && d.detectedAt)
      .map((d) => ({
        ts: new Date(d.detectedAt as string).getTime(),
        t: d.detectedAt as string,
        kind: "drift" as const,
        desc: `${SENSOR_META[d.sensor].label} 지속 드리프트 시작 (CUSUM ${d.maxStatistic}σ)`,
        color: "#d6a12f",
      }));
    return [...spikeEvents, ...driftEvents]
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

  const { summary, drift } = data;
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
            {data.project.name} · 5개 환경 센서를 실시간 시각화하고, Z-score
            급변 탐지 · CUSUM 드리프트 탐지 · 도메인 정상범위 게이트로 생장 이상을
            자동 판정합니다.
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
            <small>정상 가동률</small>
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
              summary.latestHealthy ? styles.good : styles.bad
            }`}
          >
            <small>현재 상태</small>
            <strong style={{ fontSize: 20 }}>
              {summary.latestHealthy ? "정상 범위" : "범위 이탈"}
            </strong>
          </div>
        </div>

        <div className={styles.chartGrid}>
          {CHART_SENSORS.map((sensor) => (
            <SensorChart
              key={sensor}
              sensor={sensor}
              points={data.points}
              range={data.healthyRanges[sensor]}
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
          <b>탐지 방식</b> — ① <b>Z-score</b>: 윈도우 평균 대비 3σ 초과 단발
          급변(빨간 점). ② <b>CUSUM 관리도</b>: 24시간 계절차분 + MAD 강건추정으로
          지속 드리프트의 <i>시작 시점</i>까지 특정(주황 세로선). ③ <b>절대범위
          게이트</b>: 새싹삼 도메인 정상범위(초록 밴드) 이탈로 설비 고장 판정.
          광량은 점·소등 이중상태라 CUSUM 대신 과조도 상한선만 게이트합니다.
        </div>
      </div>
    </main>
  );
}

function SensorChart({
  sensor,
  points,
  range,
  drift,
  days,
}: {
  sensor: SensorKey;
  points: MonitoringPoint[];
  range: [number, number];
  drift?: { detected: boolean; detectedAt: string | null; maxStatistic: number };
  days: number;
}) {
  const meta = SENSOR_META[sensor];
  const display = useMemo(() => downsample(points), [points]);
  const isLux = sensor === "lightIntensity";
  const [lo, hi] = range;

  const latest = points.length ? points[points.length - 1][sensor] : 0;
  const hasSpike = points.some(
    (p) => p.isAnomaly && p.affectedSensors.includes(sensor)
  );
  const hasDrift = Boolean(drift?.detected);
  const latestOut =
    points.length &&
    points[points.length - 1].outOfRange.includes(sensor);

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
        {!hasSpike && !hasDrift && !latestOut && (
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
        {latestOut && (
          <span className={`${styles.badge} ${styles.range}`}>범위 이탈</span>
        )}
      </div>

      <div className={styles.chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={display}
            margin={{ top: 6, right: 8, bottom: 0, left: -8 }}
          >
            <CartesianGrid stroke="#eef2ee" vertical={false} />
            {!isLux && (
              <ReferenceArea
                y1={lo}
                y2={hi}
                fill="#0b7d46"
                fillOpacity={0.07}
                stroke="none"
              />
            )}
            {isLux && (
              <ReferenceLine
                y={hi}
                stroke="#d6a12f"
                strokeDasharray="4 3"
                label={{
                  value: "과조도 상한",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#b07d16",
                }}
              />
            )}
            {driftTs && (
              <ReferenceLine
                x={driftTs}
                stroke="#d6a12f"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                label={{
                  value: "드리프트",
                  position: "top",
                  fontSize: 10,
                  fill: "#b07d16",
                }}
              />
            )}
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => fmtTime(v, days)}
              tick={{ fontSize: 10, fill: "#8a948c" }}
              minTickGap={40}
              stroke="#d3ddd4"
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 10, fill: "#8a948c" }}
              tickFormatter={fmtVal}
              width={38}
              stroke="#d3ddd4"
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
                      fill="#e05a3a"
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
