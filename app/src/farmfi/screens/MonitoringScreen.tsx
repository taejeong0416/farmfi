import { useEffect, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line as SvgLine, Path, Rect } from "react-native-svg";

import { apiFetch } from "@/lib/api";
import { C, FRAME_MAX_WIDTH } from "../theme";
import { PixelGlyph } from "../icons";
import { AppShell, SectionTitle } from "../components";

// ── 데이터 계약 (백엔드 /api/monitoring/[id] · lib/growth-monitoring.ts와 정합) ──
type SensorKey = "temperature" | "humidity" | "co2Level" | "lightIntensity" | "phLevel";

type Point = {
  ts: number;
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  isAnomaly: boolean;
  affectedSensors: SensorKey[];
  outOfRange: SensorKey[];
  healthy: boolean;
};

type Summary = {
  count: number;
  uptimeRate: number;
  anomalyCount: number;
  driftSensors: SensorKey[];
  latestHealthy: boolean;
};

type MonitoringResponse = {
  project: { id: string; name: string };
  days: number;
  points: Point[];
  healthyRanges: Record<SensorKey, [number, number]>;
  summary: Summary;
};

type ProjectLite = { id: string; name: string };

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

// ── SVG 라인차트 — 정상범위 밴드 + 이상치 마커 (react-native-svg) ──
function SensorChart({
  points,
  sensorKey,
  color,
  lo,
  hi,
}: {
  points: Point[];
  sensorKey: SensorKey;
  color: string;
  lo: number;
  hi: number;
}) {
  const values = points.map((p) => p[sensorKey] as number);
  if (values.length === 0) {
    return <Text style={s.chartEmpty}>데이터 없음</Text>;
  }

  const pad = { l: 4, r: 4, t: 8, b: 8 };
  const innerW = CHART_W - pad.l - pad.r;
  const innerH = CHART_H - pad.t - pad.b;
  const dmin = Math.min(...values, lo);
  const dmax = Math.max(...values, hi);
  const range = dmax - dmin || 1;
  const n = values.length;
  const xAt = (i: number) =>
    pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => pad.t + innerH - ((v - dmin) / range) * innerH;
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(" ");
  const yHi = yAt(hi);
  const yLo = yAt(lo);

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Rect
        x={pad.l}
        y={Math.min(yHi, yLo)}
        width={innerW}
        height={Math.abs(yLo - yHi)}
        fill={color}
        opacity={0.08}
      />
      <SvgLine x1={pad.l} y1={yHi} x2={CHART_W - pad.r} y2={yHi} stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.3} />
      <SvgLine x1={pad.l} y1={yLo} x2={CHART_W - pad.r} y2={yLo} stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.3} />
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

export default function MonitoringScreen() {
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 실 프로젝트 목록 로드 → 첫 프로젝트 선택
  useEffect(() => {
    let alive = true;
    apiFetch<{ projects: ProjectLite[] }>("/api/projects")
      .then((res) => {
        if (!alive) return;
        setProjects(res.projects);
        if (res.projects.length > 0) setProjectId(res.projects[0].id);
        else setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "프로젝트를 불러오지 못했습니다.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 선택 프로젝트/기간 변경 시 모니터링 로드
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    apiFetch<MonitoringResponse>(`/api/monitoring/${projectId}?days=${days}`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "모니터링 데이터를 불러오지 못했습니다.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, days]);

  const latest = data && data.points.length > 0 ? data.points[data.points.length - 1] : null;

  return (
    <AppShell active="growth">
      <View style={s.hero}>
        <PixelGlyph name="sprout" size={44} />
        <Text style={s.heroTitle}>실시간 생육 모니터링</Text>
        <Text style={s.heroSub}>센서 시계열과 이상탐지(스파이크·드리프트·범위이탈)를 확인하세요.</Text>
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

      {loading && <Text style={s.notice}>불러오는 중…</Text>}
      {error && !loading && <Text style={[s.notice, s.noticeErr]}>{error}</Text>}

      {data && !loading && (
        <>
          {/* 요약 */}
          <View style={s.summary}>
            <SummaryTile label="가동률" value={`${data.summary.uptimeRate}%`} />
            <SummaryTile label="이상 스파이크" value={`${data.summary.anomalyCount}건`} />
            <SummaryTile label="드리프트" value={`${data.summary.driftSensors.length}종`} />
            <SummaryTile label="현재 상태" value={data.summary.latestHealthy ? "정상" : "주의"} warn={!data.summary.latestHealthy} />
          </View>

          {/* 센서별 차트 */}
          <View style={s.sensors}>
            <SectionTitle icon="sprout">센서 시계열</SectionTitle>
            {data.points.length === 0 ? (
              <Text style={s.notice}>이 지점의 최근 {data.days}일 센서 데이터가 없습니다.</Text>
            ) : (
              SENSORS.map((sensor) => {
                const range = data.healthyRanges[sensor.key];
                const lo = range ? range[0] : 0;
                const hi = range ? range[1] : 0;
                const value = latest ? (latest[sensor.key] as number) : null;
                const flagged =
                  latest != null &&
                  (latest.outOfRange.includes(sensor.key) ||
                    (latest.isAnomaly && latest.affectedSensors.includes(sensor.key)));
                return (
                  <View key={sensor.key} style={s.sensorCard}>
                    <View style={s.sensorHead}>
                      <View style={s.sensorLabelRow}>
                        <View style={[s.dot, { backgroundColor: sensor.color }]} />
                        <Text style={s.sensorLabel}>{sensor.label}</Text>
                      </View>
                      <Text style={[s.sensorValue, flagged && s.sensorValueWarn]}>
                        {value != null ? value.toFixed(1) : "–"}
                        <Text style={s.sensorUnit}> {sensor.unit}</Text>
                      </Text>
                    </View>
                    <SensorChart points={data.points} sensorKey={sensor.key} color={sensor.color} lo={lo} hi={hi} />
                    <Text style={s.sensorRange}>
                      정상범위 {lo}–{hi} {sensor.unit}
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
  noticeErr: { color: "#c0492f" },

  summary: { flexDirection: "row", gap: 7, marginTop: 16 },
  tile: { flex: 1, minHeight: 70, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d9d1c5", borderRadius: 10, backgroundColor: "#fffefa", paddingVertical: 8, paddingHorizontal: 3 },
  tileLabel: { fontSize: 10, fontWeight: "600", color: "#555", textAlign: "center" },
  tileValue: { marginTop: 6, color: C.green, fontSize: 18, letterSpacing: -0.5, fontWeight: "700" },
  tileValueWarn: { color: "#c0492f" },

  sensors: { marginTop: 20 },
  sensorCard: { marginTop: 12, borderWidth: 1, borderColor: "#d9d1c5", borderRadius: 11, backgroundColor: "#fff", padding: 14 },
  sensorHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sensorLabelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  sensorLabel: { fontSize: 14, fontWeight: "700", color: C.ink },
  sensorValue: { fontSize: 17, fontWeight: "700", color: C.ink },
  sensorValueWarn: { color: "#c0492f" },
  sensorUnit: { fontSize: 11, fontWeight: "500", color: "#888" },
  sensorRange: { marginTop: 6, fontSize: 11, color: "#888" },

  chartEmpty: { height: CHART_H, textAlignVertical: "center", textAlign: "center", color: "#aaa", fontSize: 12 },
});
