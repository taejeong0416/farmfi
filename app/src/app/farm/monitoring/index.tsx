// 08 실시간 생육 모니터링 (+ 로딩)
import { StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  SENSOR_META,
  cropKindOf,
  formatReading,
  formatStamp,
  rackIdAt,
  readingSeverity,
  worstSeverity,
  stageLabel,
  type InventoryResponse,
  type MonitoringDetailResponse,
  type SensorKey,
} from "@/farmfi/api";
import { C, FS, R, SP } from "@/farmfi/theme";
import {
  AppShell,
  BedCard,
  EmptyState,
  GhostButton,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

const KEYS: SensorKey[] = ["temperature", "humidity", "co2Level", "phLevel"];

export default function MonitoringScreen() {
  const go = useGo();
  const { project, projectId } = useFarmProjects();

  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "베드 정보를 불러오지 못했습니다."
  );
  const mon = useApiResource<MonitoringDetailResponse>(
    projectId ? `/api/monitoring/${projectId}?days=1` : null,
    "센서 값을 불러오지 못했습니다."
  );

  const items = inv.data?.projects[0]?.items ?? [];
  const latest = mon.data?.points.at(-1) ?? null;
  const gate = mon.data?.healthyRanges;
  const optimal = mon.data?.optimalRanges;
  const loading = inv.loading || mon.loading;

  const readings = KEYS.map((k) => ({
    label: SENSOR_META[k].label,
    value: latest ? formatReading(k, latest[k]) : "—",
    severity: latest ? readingSeverity(k, latest[k], gate, optimal) : ("normal" as const),
  }));

  const worst = worstSeverity(readings.map((r) => r.severity));

  return (
    <AppShell
      active="monitoring"
      storeName={project?.name}
      onStorePress={() => go.push("/store-select")}
    >
      {/* 센서는 지점 단위로 달려 있다. 베드마다 다른 값이 아니라는 걸 밝혀둔다. */}
      <Text style={s.note}>
        환경 센서는 매장 단위로 수집됩니다. 모든 베드가 같은 값을 봅니다.
        {mon.data?.dataAsOf ? ` · 최근 수신 ${formatStamp(mon.data.dataAsOf)}` : ""}
      </Text>

      {mon.error && <StateNotice tone="error" message={mon.error} onRetry={mon.reload} />}
      {inv.error && <StateNotice tone="error" message={inv.error} onRetry={inv.reload} />}

      {loading && (
        <View style={s.list}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={155} radius={R.lg} />
          ))}
        </View>
      )}

      {!loading && !inv.error && items.length === 0 && (
        <EmptyState
          icon="monitor"
          title="모니터링할 베드가 없어요"
          description="작물이 배정된 베드가 생기면 여기에 나타납니다."
        />
      )}

      <View style={s.list}>
        {!loading &&
          items.map((item, i) => (
            <BedCard
              key={item.productId}
              bed={`베드 ${rackIdAt(i)}`}
              crop={item.productName}
              cropKind={cropKindOf(item.productName, item.category)}
              stage={stageLabel(item.maturityPercent)}
              severity={worst}
              readings={readings}
              deviceLabel={`성숙도 ${Math.round(item.maturityPercent)}%`}
              devicePercent={item.maturityPercent}
              updatedAt={mon.data?.dataAsOf ? formatStamp(mon.data.dataAsOf) : "—"}
              onPress={() => go.push(`/farm/monitoring/${item.productId}`)}
            />
          ))}
      </View>

      {!loading && items.length > 0 && (
        <View style={s.actions}>
          <GhostButton
            label="센서 이력"
            icon="bars"
            tone="brand"
            onPress={() => go.push("/farm/monitoring/history")}
          />
          <GhostButton
            label="센서 임계값"
            icon="settings"
            tone="brand"
            onPress={() => go.push("/farm/monitoring/thresholds")}
          />
          {/* 임계값은 "벗어나면 알린다"이고, 설정점은 "이 값으로 운전한다"다.
              둘이 다른 층이라 나란히 둔다. */}
          <GhostButton
            label="생육 설정점"
            icon="leaf"
            tone="brand"
            onPress={() => go.push("/farm/setpoints")}
          />
        </View>
      )}
    </AppShell>
  );
}

const s = StyleSheet.create({
  note: { fontSize: FS.xs, color: C.body, lineHeight: 17 },
  list: { gap: SP.md },
  actions: { gap: SP.sm },
});
