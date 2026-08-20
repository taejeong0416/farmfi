// 12 재고생육 연동 (+ 로딩, + 22 재고 부족 알림)
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  cropKindOf,
  harvestLabel,
  rackIdAt,
  ratioPercent,
  type InventoryItem,
  type InventoryResponse,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  AppShell,
  Card,
  CardTitle,
  EmptyState,
  GhostButton,
  LinkedBedRow,
  PrimaryButton,
  SkeletonBlock,
  StateNotice,
  StockRow,
  useGo,
} from "@/farmfi/ui";

// 백엔드 /api/tasks/today가 보충 대상을 판단하는 기준과 같은 값이다.
const RESTOCK_THRESHOLD = 5;

export default function InventoryScreen() {
  const go = useGo();
  const { project, projectId } = useFarmProjects();
  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "재고 현황을 불러오지 못했습니다."
  );

  const [dismissed, setDismissed] = useState(false);

  const items = inv.data?.projects[0]?.items ?? [];
  const maxStock = Math.max(...items.map((i) => i.inStock), 1);
  const low = items.filter((i) => i.inStock < RESTOCK_THRESHOLD);

  return (
    <AppShell
      active="inventory"
      storeName={project?.name}
      onStorePress={() => go.push("/store-select")}
    >
      {inv.error && <StateNotice tone="error" message={inv.error} onRetry={inv.reload} />}

      {inv.loading && (
        <>
          <SkeletonBlock height={220} radius={R.lg} />
          <SkeletonBlock height={333} radius={R.lg} />
        </>
      )}

      {!inv.loading && !inv.error && items.length === 0 && (
        <EmptyState
          icon="box"
          title="등록된 품목이 없어요"
          description="재고 품목을 등록하면 매장 진열과 베드 생육이 여기서 이어집니다."
          action="품목 등록"
          onAction={() => go.push("/farm/inventory/new")}
        />
      )}

      {items.length > 0 && (
        <>
          <Card style={s.card}>
            <CardTitle>매장 재고</CardTitle>
            {items.map((item) => (
              <StockRow
                key={item.productId}
                name={item.productName}
                cropKind={cropKindOf(item.productName, item.category)}
                qty={item.inStock}
                unit={item.unit}
                percent={ratioPercent(item.inStock, maxStock)}
                onPress={() => go.push(`/farm/inventory/${item.productId}`)}
              />
            ))}
          </Card>

          <Card style={s.card}>
            <CardTitle>베드 연동</CardTitle>
            {items.map((item, i) => (
              <LinkedBedRow
                key={item.productId}
                bed={`베드 ${rackIdAt(i)}`}
                crop={item.productName}
                cropKind={cropKindOf(item.productName, item.category)}
                maturity={item.maturityPercent}
                harvestLabel={harvestLabel(item.daysToHarvest)}
                expectedQty={`${item.growing}${item.unit}`}
                onPress={() => go.push(`/farm/inventory/${item.productId}`)}
              />
            ))}
          </Card>

          <GhostButton
            label="품목 등록"
            icon="plus"
            tone="brand"
            onPress={() => go.push("/farm/inventory/new")}
          />
        </>
      )}

      <LowStockAlert
        items={low}
        visible={low.length > 0 && !dismissed}
        onClose={() => setDismissed(true)}
        onAdjust={() => {
          setDismissed(true);
          go.push(`/farm/inventory/${low[0].productId}`);
        }}
      />
    </AppShell>
  );
}

// 22 재고 부족 알림 — 기준 수량 아래로 내려간 품목을 모아 보여준다.
function LowStockAlert({
  items,
  visible,
  onClose,
  onAdjust,
}: {
  items: InventoryItem[];
  visible: boolean;
  onClose: () => void;
  onAdjust: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.popup}>
          <View style={s.popupIcon}>
            <Text style={s.popupGlyph}>!</Text>
          </View>
          <Text style={s.popupTitle}>재고 부족</Text>
          <Text style={s.popupMessage}>기준 수량 이하인 품목이 있어요.</Text>

          <View style={s.lowList}>
            {items.slice(0, 3).map((item) => (
              <View style={s.lowRow} key={item.productId}>
                <View style={s.lowDot} />
                <View style={s.lowCopy}>
                  <Text style={s.lowName}>{item.productName}</Text>
                  <Text style={s.lowBase}>
                    부족 기준 {RESTOCK_THRESHOLD}
                    {item.unit}
                  </Text>
                </View>
                <Text style={s.lowQty}>
                  {item.inStock}
                  {item.unit}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.popupActions}>
            <GhostButton label="닫기" onPress={onClose} style={{ flex: 1 }} />
            <PrimaryButton label="재고 조정" onPress={onAdjust} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.sm },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,26,26,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: SP.xl,
  },
  popup: {
    width: "100%",
    maxWidth: 330,
    alignItems: "center",
    gap: SP.md,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
    padding: SP.xl,
  },
  popupIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  popupGlyph: { fontSize: FS.hero, fontWeight: FW.bold, color: C.danger },
  popupTitle: { fontSize: FS.xl, fontWeight: FW.semibold, color: C.ink },
  popupMessage: { fontSize: FS.sm, color: C.body, textAlign: "center" },
  popupActions: { flexDirection: "row", gap: SP.sm, alignSelf: "stretch", marginTop: SP.xs },

  lowList: { alignSelf: "stretch", gap: SP.sm },
  lowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    borderRadius: R.md,
    backgroundColor: C.surface,
    padding: SP.md,
  },
  lowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  lowCopy: { flex: 1, gap: 2 },
  lowName: { fontSize: FS.cap, fontWeight: FW.semibold, color: C.ink },
  lowBase: { fontSize: FS.xs, color: C.body },
  lowQty: { fontSize: FS.body, fontWeight: FW.bold, color: C.danger },
});
