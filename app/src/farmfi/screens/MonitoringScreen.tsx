import { useEffect, useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line as SvgLine, Path, Rect } from "react-native-svg";

import { apiFetch, describeApiError } from "@/lib/api";
import { C, FRAME_MAX_WIDTH } from "../theme";
import { PixelGlyph } from "../icons";
import { AppShell, DataAsOf, SectionTitle, StateNotice } from "../components";
import { useFarmProjects } from "../branch";
import type { HarvestForecast, LightAssessment } from "../api";

// ── 데이터 계약 (백엔드 /api/monitoring/[id] · lib/growth-monitoring.ts와 정합) ──
type SensorKey = "temperature" | "humidity" | "co2Level" | "lightIntensity" | "phLevel";

type Point = {
  ts: number;
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  growthRate: number;
  isAnomaly: boolean;
  affectedSensors: SensorKey[];
  outOfRange: SensorKey[];
  outOfOptimal: SensorKey[];
  healthy: boolean;
};

type DriftAlert = {
  sensor: SensorKey;
  detected: boolean;
  detectedAt: string | null;
  maxStatistic: number;
};

type DailyMetric = {
  ts: number;
  dli: number;
  dliRatio: number;
  gdd: number;
  litHours: number;
  growthRate: number;
  complete: boolean;
};

type Summary = {
  count: number;
  uptimeRate: number;
  anomalyCount: number;
  driftSensors: SensorKey[];
  suboptimalCount: number;
  latestHealthy: boolean;
};

type MonitoringResponse = {
  project: { id: string; name: string };
  days: number;
  // 조회 창의 끝점 = 센서 최신 시각. stale이면 화면이 기준일을 밝힌다.
  dataAsOf: string | null;
  stale: boolean;
  points: Point[];
  drift: DriftAlert[];
  daily: DailyMetric[];
  light: LightAssessment;
  harvest: HarvestForecast;
  healthyRanges: Record<SensorKey, [number, number]>;
  optimalRanges: Record<SensorKey, [number, number]>;
  summary: Summary;
};

// 구버전 백엔드는 최신 필드가 빠진 응답을 200으로 돌려준다. 화면은 이 필드들을
// 전제로 렌더하므로 없으면 렌더 도중 터진다 — 렌더 전에 계약을 확인해
// 흰 화면 대신 무엇이 없는지 알린다. dataAsOf는 정상적으로 null일 수 있어 뺀다.
const REQUIRED_FIELDS = [
  "points",
  "drift",
  "daily",
  "light",
  "harvest",
  "healthyRanges",
  "optimalRanges",
  "summary",
] as const satisfies readonly (keyof MonitoringResponse)[];

function missingContractFields(res: MonitoringResponse): string[] {
  return REQUIRED_FIELDS.filter((key) => res[key] == null);
}

const SENSORS: { key: SensorKey; label: string; unit: string; color: string }[] = [
  { key: "temperature", label: "온도", unit: "°C", color: "#e05a3a" },
  { key: "humidity", label: "습도", unit: "%", color: "#2f8fd6" },
  { key: "co2Level", label: "CO₂", unit: "ppm", color: "#7a6cd6" },
  { key: "lightIntensity", label: "광량", unit: "lux", color: "#d6a12f" },
  { key: "phLevel", label: "양액 pH", unit: "pH", color: "#0b7d46" },
];

const RANGES: { days: number; label: string }[] = [
  { days: 1, label: "24시간" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
];

const CONTENT_W = Math.min(FRAME_MAX_WIDTH, Dimensions.get("window").width) - 46;
const CHART_W = CONTENT_W - 28; // 카드 좌우 패딩(14×2) 제외
const CHART_H = 92;

// 30일이면 2,880점이 온다. SVG Path 하나에 다 담으면 프레임이 떨어지므로 표시용으로
// 솎되, 이상치는 절대 버리지 않는다 — 화면에서 사라지면 안 되는 신호다.
function downsample(points: Point[], max = 260): Point[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((p, i) => i % step === 0 || p.isAnomaly || !p.healthy);
}

// ── SVG 라인차트 — 최적대 밴드 + 고장 게이트 + 드리프트 시점 ──────────────────
function SensorChart({
  points,
  sensorKey,
  color,
  optimal,
  gate,
  driftTs,
}: {
  points: Point[];
  sensorKey: SensorKey;
  color: string;
  optimal: [number, number];
  gate: [number, number];
  driftTs: number | null;
}) {
  if (points.length === 0) {
    return <Text style={s.chartEmpty}>데이터 없음</Text>;
  }
  const isLux = sensorKey === "lightIntensity";
  const [lo, hi] = optimal;
  const [gLo, gHi] = gate;
  const values = points.map((p) => p[sensorKey] as number);

  const pad = { l: 4, r: 4, t: 8, b: 8 };
  const innerW = CHART_W - pad.l - pad.r;
  const innerH = CHART_H - pad.t - pad.b;
  // 광량은 밴드 판정을 안 하므로(일적산으로 판정) 데이터 범위만 쓴다.
  const dmin = isLux ? Math.min(...values) : Math.min(...values, lo);
  const dmax = isLux ? Math.max(...values) : Math.max(...values, hi);
  const range = dmax - dmin || 1;

  // X축은 인덱스가 아니라 시간에 비례해야 한다 — 결측 구간이 압축돼 보이면
  // "언제부터 밀렸나"를 읽을 수 없다.
  const t0 = points[0].ts;
  const tSpan = points[points.length - 1].ts - t0 || 1;
  const xAt = (i: number) => pad.l + ((points[i].ts - t0) / tSpan) * innerW;
  const yAt = (v: number) => pad.t + innerH - ((v - dmin) / range) * innerH;
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(" ");

  const yHi = yAt(hi);
  const yLo = yAt(lo);
  const driftX =
    driftTs != null && driftTs >= t0
      ? pad.l + ((driftTs - t0) / tSpan) * innerW
      : null;

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {!isLux && (
        <>
          <Rect
            x={pad.l}
            y={Math.min(yHi, yLo)}
            width={innerW}
            height={Math.abs(yLo - yHi)}
            fill={C.green}
            opacity={0.08}
          />
          {[gLo, gHi].map((g, i) => {
            const y = yAt(g);
            if (y < 0 || y > CHART_H) return null;
            return (
              <SvgLine
                key={i}
                x1={pad.l}
                y1={y}
                x2={CHART_W - pad.r}
                y2={y}
                stroke="#e05a3a"
                strokeWidth={1}
                strokeDasharray="3,4"
                opacity={0.45}
              />
            );
          })}
        </>
      )}
      {driftX != null && (
        <SvgLine
          x1={driftX}
          y1={0}
          x2={driftX}
          y2={CHART_H}
          stroke="#d6a12f"
          strokeWidth={1.5}
          strokeDasharray="5,3"
        />
      )}
      <Path d={d} stroke={color} strokeWidth={2} fill="none" />
      {points.map((p, i) => {
        const flagged =
          p.outOfRange.includes(sensorKey) ||
          (p.isAnomaly && p.affectedSensors.includes(sensorKey));
        return flagged ? (
          <Circle key={i} cx={xAt(i)} cy={yAt(values[i])} r={3} fill="#e05a3a" />
        ) : null;
      })}
    </Svg>
  );
}

// ── 일적산광량 막대 (최근 14 생육일) ────────────────────────────────────────
function DliBars({ daily, target }: { daily: DailyMetric[]; target: number }) {
  const bars = daily.filter((d) => d.complete).slice(-14);
  if (bars.length === 0) {
    return <Text style={s.chartEmpty}>완전한 생육일 없음</Text>;
  }
  const pad = { l: 4, r: 4, t: 8, b: 4 };
  const innerW = CHART_W - pad.l - pad.r;
  const innerH = CHART_H - pad.t - pad.b;
  const top = Math.max(target, ...bars.map((b) => b.dli)) * 1.1;
  const bw = innerW / bars.length;
  const yTarget = pad.t + innerH - (target / top) * innerH;

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {bars.map((b, i) => {
        const h = (b.dli / top) * innerH;
        const under = b.dliRatio < 0.9;
        return (
          <Rect
            key={b.ts}
            x={pad.l + i * bw + bw * 0.15}
            y={pad.t + innerH - h}
            width={bw * 0.7}
            height={Math.max(1, h)}
            fill={under ? "#e0a03a" : "#d6a12f"}
            opacity={under ? 0.55 : 1}
          />
        );
      })}
      <SvgLine
        x1={pad.l}
        y1={yTarget}
        x2={CHART_W - pad.r}
        y2={yTarget}
        stroke={C.green}
        strokeWidth={1.5}
        strokeDasharray="4,3"
      />
    </Svg>
  );
}

export default function MonitoringScreen() {
  // 지점 선택은 다른 운영 화면과 같은 전역 상태를 쓴다 (farmfi/branch.tsx).
  const {
    projects,
    projectId,
    setProjectId,
    loading: projectsLoading,
    error: projectsError,
    reload: reloadProjects,
  } = useFarmProjects();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // 선택 프로젝트/기간 변경 시 모니터링 로드
  useEffect(() => {
    if (!projectId) {
      setData(null);
      // 지점 목록이 아직 로딩 중이면 대기, 목록이 비었으면 로딩을 끝낸다.
      setLoading(projectsLoading);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    apiFetch<MonitoringResponse>(`/api/monitoring/${projectId}?days=${days}`)
      .then((res) => {
        if (!alive) return;
        const missing = missingContractFields(res);
        if (missing.length > 0) {
          setData(null);
          setError(
            `서버 응답에 필요한 항목이 없습니다 (${missing.join(", ")}). 백엔드 배포가 화면보다 오래됐을 수 있습니다.`
          );
          setLoading(false);
          return;
        }
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setData(null);
        setError(describeApiError(e, "모니터링 데이터를 불러오지 못했습니다."));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, days, nonce, projectsLoading]);

  const latest = data && data.points.length > 0 ? data.points[data.points.length - 1] : null;
  const display = useMemo(() => (data ? downsample(data.points) : []), [data]);
  const driftMap = useMemo(() => {
    const m = new Map<SensorKey, number | null>();
    data?.drift.forEach((d) => {
      if (d.detected && d.detectedAt) m.set(d.sensor, new Date(d.detectedAt).getTime());
    });
    return m;
  }, [data]);

  return (
    <AppShell active="growth">
      <View style={s.hero}>
        <PixelGlyph name="sprout" size={44} />
        <Text style={s.heroTitle}>실시간 생육 모니터링</Text>
        <Text style={s.heroSub}>센서 시계열과 이상탐지(스파이크·드리프트·설비이상), 일적산광량과 수확 예측을 확인하세요.</Text>
      </View>

      {/* 지점 선택 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipRowInner}>
        {projects.map((p) => {
          const on = p.id === projectId;
          return (
            <Pressable key={p.id} onPress={() => setProjectId(p.id)} style={[s.chip, on && s.chipOn]}>
              <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={1}>
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 기간 선택 */}
      <View style={s.rangeRow}>
        {RANGES.map((r) => {
          const on = r.days === days;
          return (
            <Pressable key={r.days} onPress={() => setDays(r.days)} style={[s.range, on && s.rangeOn]}>
              <Text style={[s.rangeText, on && s.rangeTextOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {projectsError && (
        <StateNotice tone="error" message={projectsError} onRetry={reloadProjects} />
      )}
      {!projectsError && !projectsLoading && projects.length === 0 && (
        <StateNotice message="등록된 지점이 없습니다." onRetry={reloadProjects} retryLabel="새로고침" />
      )}
      {!projectsError && loading && <StateNotice message="불러오는 중…" />}
      {!projectsError && error && !loading && (
        <StateNotice tone="error" message={error} onRetry={() => setNonce((n) => n + 1)} />
      )}

      {data && !loading && (
        <>
          {/* 요약 */}
          <View style={s.summary}>
            <SummaryTile label="설비 가동률" value={`${data.summary.uptimeRate}%`} />
            <SummaryTile label="이상 스파이크" value={`${data.summary.anomalyCount}건`} />
            <SummaryTile label="드리프트" value={`${data.summary.driftSensors.length}종`} />
            <SummaryTile label="현재 상태" value={data.summary.latestHealthy ? "정상" : "주의"} warn={!data.summary.latestHealthy} />
          </View>
          <DataAsOf dataAsOf={data.dataAsOf} stale={data.stale} />

          {/* 일적산광량 — 광량은 순간값이 아니라 하루 총량으로 판정한다 */}
          <View style={s.block}>
            <SectionTitle icon="sprout">일적산광량 (DLI)</SectionTitle>
            <View style={[s.panel, data.light.status === "under" && s.panelBad]}>
              <View style={s.panelHead}>
                <Text style={s.panelLabel}>최근 평균</Text>
                <Text style={[s.panelValue, data.light.status === "under" && s.panelValueWarn]}>
                  {data.light.recentDli.toFixed(1)}
                  <Text style={s.panelUnit}> / {data.light.dliTarget} mol</Text>
                </Text>
              </View>
              <DliBars daily={data.daily} target={data.light.dliTarget} />
              <Text style={s.panelMsg}>{data.light.message}</Text>
            </View>
          </View>

          {/* 수확 예측 */}
          <View style={s.block}>
            <SectionTitle icon="basket">수확 예측 (적산온도)</SectionTitle>
            <View style={[s.panel, (data.harvest.delayDays ?? 0) >= 1 && s.panelBad]}>
              <View style={s.panelHead}>
                <Text style={s.panelLabel}>{data.harvest.cropLabel} · 잔여</Text>
                <Text style={s.panelValue}>
                  {data.harvest.daysRemaining != null
                    ? `D-${Math.ceil(data.harvest.daysRemaining)}`
                    : "–"}
                </Text>
              </View>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${Math.min(100, data.harvest.gddProgressPct)}%` },
                  ]}
                />
              </View>
              <View style={s.kvRow}>
                <View style={s.kv}>
                  <Text style={s.kvLabel}>누적 GDD</Text>
                  <Text style={s.kvValue}>
                    {data.harvest.accumulatedGdd}
                    <Text style={s.kvUnit}> / {data.harvest.targetGdd}</Text>
                  </Text>
                </View>
                <View style={s.kv}>
                  <Text style={s.kvLabel}>사이클 경과</Text>
                  <Text style={s.kvValue}>
                    {data.harvest.cycleElapsedDays}
                    <Text style={s.kvUnit}> 일</Text>
                  </Text>
                </View>
                <View style={s.kv}>
                  <Text style={s.kvLabel}>진행률</Text>
                  <Text style={s.kvValue}>
                    {data.harvest.gddProgressPct}
                    <Text style={s.kvUnit}> %</Text>
                  </Text>
                </View>
              </View>
              <Text style={s.panelMsg}>{data.harvest.message}</Text>
            </View>
          </View>

          {/* 센서별 차트 */}
          <View style={s.block}>
            <SectionTitle icon="sprout">센서 시계열</SectionTitle>
            {data.points.length === 0 ? (
              <Text style={s.notice}>이 지점의 최근 {data.days}일 센서 데이터가 없습니다.</Text>
            ) : (
              SENSORS.map((sensor) => {
                const optimal = data.optimalRanges[sensor.key] ?? [0, 0];
                const gate = data.healthyRanges[sensor.key] ?? [0, 0];
                const value = latest ? (latest[sensor.key] as number) : null;
                const isLux = sensor.key === "lightIntensity";
                const fault = latest != null && latest.outOfRange.includes(sensor.key);
                const subopt = latest != null && latest.outOfOptimal.includes(sensor.key);
                const drifting = driftMap.has(sensor.key);
                return (
                  <View key={sensor.key} style={s.sensorCard}>
                    <View style={s.sensorHead}>
                      <View style={s.sensorLabelRow}>
                        <View style={[s.dot, { backgroundColor: sensor.color }]} />
                        <Text style={s.sensorLabel}>{sensor.label}</Text>
                      </View>
                      <Text style={[s.sensorValue, (fault || subopt) && s.sensorValueWarn]}>
                        {value != null ? value.toFixed(1) : "–"}
                        <Text style={s.sensorUnit}> {sensor.unit}</Text>
                      </Text>
                    </View>
                    <View style={s.badgeRow}>
                      {fault && <Badge text="설비 이상" tone="bad" />}
                      {!fault && subopt && <Badge text="최적대 이탈" tone="warn" />}
                      {drifting && <Badge text="드리프트" tone="warn" />}
                      {isLux && <Badge text="DLI로 판정" tone="info" />}
                    </View>
                    <SensorChart
                      points={display}
                      sensorKey={sensor.key}
                      color={sensor.color}
                      optimal={optimal}
                      gate={gate}
                      driftTs={driftMap.get(sensor.key) ?? null}
                    />
                    <Text style={s.sensorRange}>
                      {isLux
                        ? "순간 조도는 점등 스케줄에 따라 달라집니다 — 일적산으로 판정"
                        : `최적대 ${optimal[0]}–${optimal[1]} · 고장 게이트 ${gate[0]}–${gate[1]} ${sensor.unit}`}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </AppShell>
  );
}

function Badge({ text, tone }: { text: string; tone: "bad" | "warn" | "info" }) {
  return (
    <View style={[s.badge, tone === "bad" && s.badgeBad, tone === "info" && s.badgeInfo]}>
      <Text style={[s.badgeText, tone === "bad" && s.badgeTextBad, tone === "info" && s.badgeTextInfo]}>
        {text}
      </Text>
    </View>
  );
}

function SummaryTile({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, warn && s.tileValueWarn]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: 10, paddingBottom: 12 },
  heroTitle: { marginTop: 7, fontSize: 26, letterSpacing: -1, color: C.ink, fontWeight: "700" },
  heroSub: { marginTop: 7, color: "#474a46", fontSize: 12, textAlign: "center", paddingHorizontal: 12, lineHeight: 18 },

  chipRow: { marginTop: 4 },
  chipRowInner: { gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, height: 38, justifyContent: "center", borderWidth: 1, borderColor: "#d6cec2", borderRadius: 9, backgroundColor: "#fff", maxWidth: 160 },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { fontSize: 13, color: C.ink, fontWeight: "600" },
  chipTextOn: { color: "#fff", fontWeight: "700" },

  rangeRow: { flexDirection: "row", marginTop: 12, gap: 7 },
  range: { flex: 1, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d6cec2", borderRadius: 9, backgroundColor: "#fff" },
  rangeOn: { borderColor: C.green, backgroundColor: C.greenSoft },
  rangeText: { fontSize: 13, color: C.ink, fontWeight: "600" },
  rangeTextOn: { color: C.green, fontWeight: "700" },

  notice: { marginTop: 16, color: "#666862", fontSize: 13, textAlign: "center" },

  summary: { flexDirection: "row", gap: 7, marginTop: 16 },
  tile: { flex: 1, minHeight: 70, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d9d1c5", borderRadius: 10, backgroundColor: "#fffefa", paddingVertical: 8, paddingHorizontal: 3 },
  tileLabel: { fontSize: 10, fontWeight: "600", color: "#555", textAlign: "center" },
  tileValue: { marginTop: 6, color: C.green, fontSize: 18, letterSpacing: -0.5, fontWeight: "700" },
  tileValueWarn: { color: "#c0492f" },

  block: { marginTop: 20 },
  panel: { marginTop: 12, borderWidth: 1, borderColor: "#d9d1c5", borderRadius: 11, backgroundColor: "#fff", padding: 14 },
  panelBad: { borderColor: "#e6b0a2" },
  panelHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  panelLabel: { fontSize: 12, color: "#666862", fontWeight: "600" },
  panelValue: { fontSize: 20, fontWeight: "700", color: C.ink },
  panelValueWarn: { color: "#c0492f" },
  panelUnit: { fontSize: 11, fontWeight: "500", color: "#888" },
  panelMsg: { marginTop: 10, fontSize: 11, lineHeight: 17, color: "#4a5a4d" },

  progressTrack: { height: 8, borderRadius: 999, backgroundColor: "#eef2ee", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: C.green },

  kvRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  kv: { flex: 1 },
  kvLabel: { fontSize: 10, color: "#666862", marginBottom: 3 },
  kvValue: { fontSize: 14, fontWeight: "700", color: C.ink },
  kvUnit: { fontSize: 10, fontWeight: "500", color: "#888" },

  sensorCard: { marginTop: 12, borderWidth: 1, borderColor: "#d9d1c5", borderRadius: 11, backgroundColor: "#fff", padding: 14 },
  sensorHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sensorLabelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  sensorLabel: { fontSize: 14, fontWeight: "700", color: C.ink },
  sensorValue: { fontSize: 17, fontWeight: "700", color: C.ink },
  sensorValueWarn: { color: "#c0492f" },
  sensorUnit: { fontSize: 11, fontWeight: "500", color: "#888" },
  sensorRange: { marginTop: 6, fontSize: 10, color: "#888", lineHeight: 15 },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: "#ecdcb0", backgroundColor: "#fff8e8" },
  badgeBad: { borderColor: "#f0bcae", backgroundColor: "#fdece7" },
  badgeInfo: { borderColor: "#ccd6ec", backgroundColor: "#eef2fb" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#96701a" },
  badgeTextBad: { color: "#a8341c" },
  badgeTextInfo: { color: "#4a5b8c" },

  chartEmpty: { height: CHART_H, textAlignVertical: "center", textAlign: "center", color: "#aaa", fontSize: 12 },
});
