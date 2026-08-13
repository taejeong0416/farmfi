// 명세 4.1 센서 이력 그래프 — 항목·기간을 골라 추이를 본다.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { C } from "../theme";
import { type RackId } from "../data";
import { DEFAULT_THRESHOLDS, SENSOR_HISTORY, SENSOR_META, type SensorKey } from "../demoData";
import { Card, CardTitle, DetailShell, KeyValueRow, LineChart, SegmentedTabs , DemoBadge } from "../ui";

type Range = "24h" | "7d" | "30d";

const RANGE_LABEL: Record<Range, string> = { "24h": "24시간", "7d": "7일", "30d": "30일" };

// 24시간 원본을 기간에 맞춰 리샘플. 7일/30일은 일평균에 완만한 변동을 준 값.
function series(key: SensorKey, range: Range) {
  const base = SENSOR_HISTORY[key];
  if (range === "24h") return base;
  const buckets = range === "7d" ? 7 : 30;
  const avg = base.reduce((a, b) => a + b, 0) / base.length;
  const swing = (Math.max(...base) - Math.min(...base)) * 0.35;
  return Array.from({ length: buckets }, (_, i) => {
    const wave = Math.sin((i / buckets) * Math.PI * 2.4) * swing;
    return Math.round((avg + wave) * 10) / 10;
  });
}

function labels(range: Range) {
  if (range === "24h") return ["00시", "06시", "12시", "18시", "24시"];
  if (range === "7d") return ["6일 전", "4일 전", "2일 전", "오늘"];
  return ["4주 전", "3주 전", "2주 전", "1주 전", "오늘"];
}

export default function SensorHistoryScreen() {
  const { rack } = useLocalSearchParams<{ rack?: string }>();
  const rackId = (rack && ["A", "B", "C", "D"].includes(rack) ? rack : "A") as RackId;

  const [key, setKey] = useState<SensorKey>("temp");
  const [range, setRange] = useState<Range>("24h");

  const values = useMemo(() => series(key, range), [key, range]);
  const meta = SENSOR_META[key];
  const band = DEFAULT_THRESHOLDS[key];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  const outOfRange = values.filter((v) => v < band.min || v > band.max).length;

  return (
    <DetailShell title="센서 이력" subtitle={`베드 ${rackId} · ${RANGE_LABEL[range]}`}>
      <DemoBadge />
      <SegmentedTabs<SensorKey>
        value={key}
        onChange={setKey}
        options={(Object.keys(SENSOR_META) as SensorKey[]).map((k) => ({ key: k, label: SENSOR_META[k].label }))}
      />
      <SegmentedTabs<Range>
        value={range}
        onChange={setRange}
        options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ key: r, label: RANGE_LABEL[r] }))}
      />

      <Card>
        <CardTitle icon="bars">{meta.label} 추이</CardTitle>
        <View style={s.chartWrap}>
          <LineChart values={values} labels={labels(range)} unit={meta.unit} band={band} />
        </View>
        <View style={s.legend}>
          <View style={s.legendSwatch} />
          <Text style={s.legendText}>
            정상 범위 {band.min}~{band.max}
            {meta.unit}
          </Text>
        </View>
      </Card>

      <Card>
        <CardTitle icon="check">기간 요약</CardTitle>
        <View style={s.kv}>
          <KeyValueRow label="평균" value={`${avg}${meta.unit}`} />
          <KeyValueRow label="최저" value={`${min}${meta.unit}`} />
          <KeyValueRow label="최고" value={`${max}${meta.unit}`} />
          <KeyValueRow
            label="범위 이탈"
            value={outOfRange === 0 ? "없음" : `${outOfRange}회`}
            tone={outOfRange === 0 ? C.green : C.danger}
          />
        </View>
      </Card>
    </DetailShell>
  );
}

const s = StyleSheet.create({
  chartWrap: { marginTop: 12 },
  legend: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  legendSwatch: { width: 18, height: 10, borderRadius: 3, backgroundColor: C.greenSoft, borderWidth: 1, borderColor: "#cfe0cd" },
  legendText: { fontSize: 10, color: C.muted },
  kv: { marginTop: 6 },
});
