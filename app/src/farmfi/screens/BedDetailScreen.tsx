// 명세 4.1 베드 환경 모니터링 — GET /api/monitoring/[projectId] 실연동.
//
// 임계값은 서버가 주는 healthyRanges 를 그대로 쓴다. 앱에 하드코딩하면 서버 기준이
// 바뀔 때 화면만 조용히 거짓을 말하게 된다.
//
// 명세 4.2 설비 제어는 백엔드 엔드포인트가 아직 없다. 가짜 토글을 두면 운영자가
// 실제로 제어된 줄 알게 되므로, 상태 표시 없이 "미연동" 안내만 둔다.
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { C } from "../theme";
import { useFarmProjects } from "../branch";
import { useApiResource } from "../useApiResource";
import {
  SENSOR_KEYS,
  SENSOR_META,
  evaluateSensor,
  formatMonthDay,
  worstOf,
  type MonitoringResponse,
  type Severity,
} from "../api";
import { Badge, Card, CardTitle, DetailShell, EmptyState, PixelIcon, SensorTile } from "../ui";

const MONITOR_DAYS = 1;

export default function BedDetailScreen() {
  const { rack } = useLocalSearchParams<{ rack?: string }>();
  const { project, projectId } = useFarmProjects();

  const res = useApiResource<MonitoringResponse>(
    projectId ? `/api/monitoring/${projectId}?days=${MONITOR_DAYS}` : null,
    "센서 데이터를 불러오지 못했습니다."
  );

  const latest = res.data?.points?.length ? res.data.points[res.data.points.length - 1] : null;
  const ranges = res.data?.healthyRanges;

  const states: Severity[] =
    latest && ranges ? SENSOR_KEYS.map((k) => evaluateSensor(latest[k], ranges[k])) : [];
  const worst = states.length ? worstOf(states) : "normal";

  return (
    <DetailShell
      title={rack ? `베드 ${rack}` : "베드 상세"}
      subtitle={
        latest
          ? `${project?.name ?? ""} · 최근 수신 ${formatMonthDay(latest.t)} ${new Date(latest.ts).toTimeString().slice(0, 5)}`
          : project?.name ?? ""
      }
      action={latest ? <Badge severity={worst} /> : undefined}
    >
      <Card>
        <CardTitle icon="monitor">환경 센서</CardTitle>
        {res.loading ? (
          <EmptyState icon="sensor-temp" title="센서 값을 불러오는 중…" />
        ) : res.error ? (
          <EmptyState icon="ui-warning" title="센서 데이터를 불러오지 못했어요" caption={res.error} />
        ) : !latest || !ranges ? (
          <EmptyState icon="ui-warning" title="수신된 판독이 없어요" caption="이 기간에 센서 데이터가 없습니다." />
        ) : (
          <>
            {[SENSOR_KEYS.slice(0, 2), SENSOR_KEYS.slice(2, 4), SENSOR_KEYS.slice(4)].map((row, i) => (
              <View style={s.sensorRow} key={i}>
                {row.map((key) => {
                  const meta = SENSOR_META[key];
                  const value = latest[key];
                  return (
                    <SensorTile
                      key={key}
                      label={meta.label}
                      value={value >= 1000 ? value.toLocaleString("ko-KR") : String(Math.round(value * 10) / 10)}
                      unit={meta.unit}
                      state={evaluateSensor(value, ranges[key])}
                      icon={meta.icon}
                    />
                  );
                })}
                {/* 5종은 홀수라 마지막 줄에 빈 칸을 채워 폭을 맞춘다 */}
                {row.length === 1 ? <View style={s.spacer} /> : null}
              </View>
            ))}
            <Text style={s.ranges}>
              {SENSOR_KEYS.map((k) => `${SENSOR_META[k].label} ${ranges[k][0]}~${ranges[k][1]}${SENSOR_META[k].unit}`).join(" · ")}
            </Text>
          </>
        )}
      </Card>

      {res.data?.summary ? (
        <Card>
          <CardTitle icon="check">가동 요약</CardTitle>
          <View style={s.kpis}>
            {[
              ["가동률", `${Math.round(res.data.summary.uptimeRate)}%`, C.green],
              ["이상 신호", `${res.data.summary.anomalyCount}건`, res.data.summary.anomalyCount > 0 ? C.warn : C.green],
              ["드리프트", `${res.data.summary.driftSensors.length}종`, res.data.summary.driftSensors.length > 0 ? C.warn : C.green],
              ["현재 상태", res.data.summary.latestHealthy ? "정상" : "점검", res.data.summary.latestHealthy ? C.green : C.danger],
            ].map(([k, v, tone]) => (
              <View style={s.kpi} key={k}>
                <Text style={s.kpiLabel}>{k}</Text>
                <Text style={[s.kpiValue, { color: tone }]}>{v}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <CardTitle icon="link">설비 제어</CardTitle>
        <View style={s.notWired}>
          <PixelIcon name="ui-warning" size={26} />
          <Text style={s.notWiredText}>
            설비 제어 API가 아직 없습니다. 조작 결과를 보장할 수 없어 토글을 노출하지 않습니다.
          </Text>
        </View>
      </Card>
    </DetailShell>
  );
}

const s = StyleSheet.create({
  sensorRow: { flexDirection: "row", gap: 7, marginTop: 12 },
  spacer: { flex: 1 },
  ranges: { marginTop: 10, fontSize: 10, lineHeight: 15, color: C.muted },

  kpis: { flexDirection: "row", gap: 7, marginTop: 12 },
  kpi: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    minHeight: 66,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  kpiLabel: { fontSize: 10, color: C.muted },
  kpiValue: { fontSize: 17, fontWeight: "700" },

  notWired: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2cfa8",
    borderRadius: 8,
    backgroundColor: C.warnSoft,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  notWiredText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#7a5a1e", fontWeight: "600" },
});
