// 10 센서 이력
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  SENSOR_META,
  formatReading,
  type MonitoringDetailResponse,
  type SensorKey,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  Card,
  CardTitle,
  DetailShell,
  LineChart,
  Pill,
  SkeletonBlock,
  StateNotice,
} from "@/farmfi/ui";

const KEYS: SensorKey[] = ["temperature", "humidity", "co2Level", "phLevel"];
const RANGES = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
];

export default function SensorHistoryScreen() {
  const { projectId, project } = useFarmProjects();
  const [key, setKey] = useState<SensorKey>("co2Level");
  const [days, setDays] = useState(1);

  const mon = useApiResource<MonitoringDetailResponse>(
    projectId ? `/api/monitoring/${projectId}?days=${days}` : null,
    "센서 이력을 불러오지 못했습니다."
  );

  const meta = SENSOR_META[key];
  const band = mon.data?.healthyRanges?.[key];

  const stats = useMemo(() => {
    const values = (mon.data?.points ?? []).map((p) => p[key]);
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    const out = band ? values.filter((v) => v < band[0] || v > band[1]).length : 0;
    return {
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      out,
      count: values.length,
    };
  }, [mon.data, key, band]);

  // 점이 많으면 선이 뭉개진다. 화면 폭에 맞춰 고르게 솎는다.
  const points = useMemo(() => {
    const values = (mon.data?.points ?? []).map((p) => p[key]);
    const cap = 120;
    if (values.length <= cap) return values;
    const step = values.length / cap;
    return Array.from({ length: cap }, (_, i) => values[Math.floor(i * step)]);
  }, [mon.data, key]);

  return (
    <DetailShell
      requiresProject title="센서 이력" subtitle={project?.name}>
      <View style={s.tabRow}>
        {KEYS.map((k) => (
          <Pill
            key={k}
            label={SENSOR_META[k].label}
            active={k === key}
            onPress={() => setKey(k)}
          />
        ))}
      </View>

      <View style={s.tabRow}>
        {RANGES.map((r) => (
          <Pill key={r.label} label={r.label} active={r.days === days} onPress={() => setDays(r.days)} />
        ))}
      </View>

      {mon.loading && <SkeletonBlock height={240} radius={R.lg} />}
      {mon.error && <StateNotice tone="error" message={mon.error} onRetry={mon.reload} />}

      {!mon.loading && !mon.error && (
        <>
          <Card style={s.card}>
            <LineChart
              title={`${meta.label} 추이`}
              points={points}
              band={band ? { min: band[0], max: band[1] } : undefined}
              caption={
                band
                  ? `정상 범위 ${band[0]}~${band[1]}${meta.unit}`
                  : "정상 범위가 정의되지 않은 항목입니다"
              }
            />
          </Card>

          <Card style={s.card}>
            <CardTitle>기간 요약</CardTitle>
            {stats ? (
              <>
                <Row label="평균" value={formatReading(key, stats.avg)} />
                <Row label="최저" value={formatReading(key, stats.min)} />
                <Row label="최고" value={formatReading(key, stats.max)} />
                <Row label="범위 이탈" value={`${stats.out}회`} />
                <Row label="판독 수" value={`${stats.count.toLocaleString()}건`} />
              </>
            ) : (
              <Text style={s.quiet}>이 기간에 수신된 판독이 없습니다.</Text>
            )}
          </Card>
        </>
      )}
    </DetailShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tabRow: { flexDirection: "row", gap: SP.sm, flexWrap: "wrap" },
  card: { gap: SP.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SP.sm,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
  },
  rowLabel: { fontSize: FS.cap, color: C.body },
  rowValue: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },
  quiet: { fontSize: FS.cap, color: C.body },
});
