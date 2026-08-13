// 명세 4.1 센서 이력 그래프 — GET /api/monitoring/[projectId]?days= 실연동.
// 정상범위 밴드와 이탈 판정 모두 서버 healthyRanges 기준이다.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C } from "../theme";
import { useFarmProjects } from "../branch";
import { useApiResource } from "../useApiResource";
import {
  SENSOR_KEYS,
  SENSOR_META,
  formatMonthDay,
  type MonitoringResponse,
  type SensorKey,
} from "../api";
import { Card, CardTitle, DetailShell, EmptyState, KeyValueRow, LineChart, SegmentedTabs } from "../ui";

type Range = "1" | "7" | "30";
const RANGE_LABEL: Record<Range, string> = { "1": "24시간", "7": "7일", "30": "30일" };

export default function SensorHistoryScreen() {
  const { project, projectId } = useFarmProjects();
  const [key, setKey] = useState<SensorKey>("temperature");
  const [days, setDays] = useState<Range>("1");

  const res = useApiResource<MonitoringResponse>(
    projectId ? `/api/monitoring/${projectId}?days=${days}` : null,
    "센서 이력을 불러오지 못했습니다."
  );

  const meta = SENSOR_META[key];
  const band = res.data?.healthyRanges?.[key];
  const values = useMemo(() => (res.data?.points ?? []).map((p) => p[key]), [res.data, key]);

  // 축 라벨은 실제 수신 시각에서 균등 샘플링한다(가짜 눈금을 만들지 않는다).
  const labels = useMemo(() => {
    const pts = res.data?.points ?? [];
    if (pts.length === 0) return [];
    const n = Math.min(5, pts.length);
    return Array.from({ length: n }, (_, i) => {
      const p = pts[Math.round((i / (n - 1 || 1)) * (pts.length - 1))];
      const d = new Date(p.ts);
      return days === "1" ? `${String(d.getHours()).padStart(2, "0")}시` : formatMonthDay(p.t);
    });
  }, [res.data, days]);

  const stats = useMemo(() => {
    if (values.length === 0 || !band) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const out = values.filter((v) => v < band[0] || v > band[1]).length;
    const r = (n: number) => Math.round(n * 10) / 10;
    return { min: r(min), max: r(max), avg: r(avg), out };
  }, [values, band]);

  return (
    <DetailShell
      title="센서 이력"
      subtitle={`${project?.name ?? ""} · ${RANGE_LABEL[days]}${res.data ? ` · ${res.data.summary.count}건` : ""}`}
    >
      <SegmentedTabs<SensorKey>
        value={key}
        onChange={setKey}
        options={SENSOR_KEYS.map((k) => ({ key: k, label: SENSOR_META[k].label }))}
      />
      <SegmentedTabs<Range>
        value={days}
        onChange={setDays}
        options={(["1", "7", "30"] as Range[]).map((d) => ({ key: d, label: RANGE_LABEL[d] }))}
      />

      <Card>
        <CardTitle icon="bars">{meta.label} 추이</CardTitle>
        {res.loading ? (
          <EmptyState icon="sensor-temp" title="불러오는 중…" />
        ) : res.error ? (
          <EmptyState icon="ui-warning" title="이력을 불러오지 못했어요" caption={res.error} />
        ) : values.length === 0 || !band ? (
          <EmptyState icon="ui-warning" title="이 기간에 판독이 없어요" caption="다른 기간을 선택해보세요." />
        ) : (
          <>
            <View style={s.chartWrap}>
              <LineChart
                values={values}
                labels={labels}
                unit={meta.unit}
                band={{ min: band[0], max: band[1] }}
              />
            </View>
            <View style={s.legend}>
              <View style={s.legendSwatch} />
              <Text style={s.legendText}>
                정상 범위 {band[0]}~{band[1]}
                {meta.unit} (서버 기준)
              </Text>
            </View>
          </>
        )}
      </Card>

      {stats && band ? (
        <Card>
          <CardTitle icon="check">기간 요약</CardTitle>
          <View style={s.kv}>
            <KeyValueRow label="평균" value={`${stats.avg}${meta.unit}`} />
            <KeyValueRow label="최저" value={`${stats.min}${meta.unit}`} />
            <KeyValueRow label="최고" value={`${stats.max}${meta.unit}`} />
            <KeyValueRow
              label="범위 이탈"
              value={stats.out === 0 ? "없음" : `${stats.out}회`}
              tone={stats.out === 0 ? C.green : C.danger}
            />
          </View>
        </Card>
      ) : null}
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
