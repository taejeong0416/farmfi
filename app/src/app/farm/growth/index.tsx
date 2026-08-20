// 04 재배생육 현황 (+ 로딩)
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { cropKindOf, rackIdAt, stageLabel, type InventoryResponse } from "@/farmfi/api";
import { R, SP } from "@/farmfi/theme";
import {
  AppShell,
  BedTabs,
  Card,
  CropProgressRow,
  EmptyState,
  GhostButton,
  MetricTile,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

const ALL = "전체";

export default function GrowthScreen() {
  const go = useGo();
  const { project, projectId } = useFarmProjects();
  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "재배 현황을 불러오지 못했습니다."
  );

  const [bed, setBed] = useState(ALL);

  const farm = inv.data?.projects[0];
  const items = farm?.items ?? [];
  // 베드는 품목 순서대로 A·B·C·D가 붙는다.
  const withBed = items.map((item, i) => ({ item, bed: `베드 ${rackIdAt(i)}` }));
  const bedNames = [ALL, ...withBed.map((w) => w.bed)];
  const shown = bed === ALL ? withBed : withBed.filter((w) => w.bed === bed);

  const avgMaturity =
    items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + i.maturityPercent, 0) / items.length)
      : 0;

  return (
    <AppShell active="growth" storeName={project?.name} onStorePress={() => go.push("/store-select")}>
      <View style={s.kpiRow}>
        {inv.loading ? (
          [0, 1, 2].map((i) => <SkeletonBlock key={i} height={71} radius={R.lg} style={s.kpiSkeleton} />)
        ) : (
          <>
            <MetricTile label="재배 베드" value={String(farm?.summary.bedCount ?? 0)} unit="개" />
            <MetricTile label="평균 성숙도" value={String(avgMaturity)} unit="%" />
            <MetricTile label="수확 가능" value={String(farm?.summary.harvestReadyTotal ?? 0)} unit="봉" />
          </>
        )}
      </View>

      {inv.error && <StateNotice tone="error" message={inv.error} onRetry={inv.reload} />}

      {!inv.loading && !inv.error && items.length === 0 && (
        <EmptyState
          icon="sprout"
          title="재배 중인 작물이 없어요"
          description="베드에 작물을 배정하면 생육 현황이 여기에 나타납니다."
          action="재배 일정 등록"
          onAction={() => go.push("/farm/schedule/new")}
        />
      )}

      {items.length > 0 && (
        <>
          <BedTabs beds={bedNames} active={bed} onChange={setBed} />

          <View style={s.list}>
            {inv.loading
              ? [0, 1, 2].map((i) => <SkeletonBlock key={i} height={84} radius={R.lg} />)
              : shown.map(({ item, bed: bedName }) => (
                  <Card key={item.productId} style={s.card}>
                    <CropProgressRow
                      crop={item.productName}
                      cropKind={cropKindOf(item.productName, item.category)}
                      where={`${bedName} · ${stageLabel(item.maturityPercent)}`}
                      percent={item.maturityPercent}
                      onPress={() => go.push(`/farm/growth/${item.productId}`)}
                    />
                  </Card>
                ))}
          </View>

          <GhostButton
            label="재배 일정 보기"
            icon="calendar"
            tone="brand"
            onPress={() => go.push("/farm/schedule")}
          />
        </>
      )}
    </AppShell>
  );
}

const s = StyleSheet.create({
  kpiRow: { flexDirection: "row", gap: SP.md },
  kpiSkeleton: { flex: 1 },
  list: { gap: SP.md },
  card: { paddingVertical: SP.sm },
});
