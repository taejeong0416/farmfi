import { StyleSheet, Text, View } from "react-native";

import { C } from "../theme";
import { AppIcon, PixelGlyph } from "../icons";
import type { CropKind } from "../data";
import { cropKindOf, projectStatusLabel, type InventoryResponse } from "../api";
import { AppShell, CropPixel, GrowthRackScene, StateNotice, TapScale } from "../components";
import { useFarmProjects } from "../branch";
import { useApiResource } from "../useApiResource";

function Diamond() {
  return <View style={s.diamond} />;
}

function StoreFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={s.storeFact}>
      <View style={s.factIcon}>{icon}</View>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

type StoreFacts = {
  harvestReady: number;
  bedCount: number;
  kind: CropKind;
  maturity: number;
} | null;

function StoreCard({
  name,
  statusLabel,
  facts,
  factsPlaceholder,
  selected,
  onSelect,
}: {
  name: string;
  statusLabel: string;
  facts: StoreFacts;
  factsPlaceholder: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TapScale onPress={onSelect} style={[s.storeCard, selected && s.storeCardSelected]}>
      <View style={s.thumbnail}>
        {facts ? (
          <GrowthRackScene kind={facts.kind} maturity={facts.maturity} compact />
        ) : (
          <View style={s.thumbnailEmpty} />
        )}
      </View>
      <View style={s.cardCopy}>
        <View style={s.cardHeading}>
          <Text style={s.cardName} numberOfLines={1}>{name}</Text>
          {selected ? (
            <View style={s.badgeSel}>
              <AppIcon name="check" size={14} color="#fff" />
              <Text style={s.badgeSelText}>선택됨</Text>
            </View>
          ) : (
            <View style={s.badgeChoose}>
              <View style={s.chooseDot} />
              <Text style={s.badgeChooseText}>선택</Text>
            </View>
          )}
        </View>
        <StoreFact icon={<PixelGlyph name="sprout" size={20} />} label="농장 상태" value={statusLabel} />
        <StoreFact
          icon={facts ? <CropPixel kind={facts.kind} size="tiny" /> : <View style={s.factIconEmpty} />}
          label="수확 가능"
          value={facts ? `${facts.harvestReady}봉` : factsPlaceholder}
        />
        <StoreFact
          icon={<PixelGlyph name="bed" size={20} />}
          label="재배 베드"
          value={facts ? `${facts.bedCount}개` : factsPlaceholder}
        />
      </View>
    </TapScale>
  );
}

export default function StoreScreen() {
  const { projects, projectId, setProjectId, loading, error, reload } = useFarmProjects();

  // 지점별 수확 가능량·베드 수는 재고 API가 유일한 출처. projectId 없이 호출하면
  // 전 지점이 한 번에 오므로 카드마다 요청을 반복하지 않는다.
  const inventory = useApiResource<InventoryResponse>(
    "/api/inventory",
    "재고 현황을 불러오지 못했습니다."
  );

  const factsOf = (id: string): StoreFacts => {
    const group = inventory.data?.projects.find((p) => p.projectId === id);
    if (!group || group.items.length === 0) return null;
    // 썸네일은 수확이 가장 임박한 품목(정렬 기준 expectedHarvestAt asc)을 대표로 쓴다.
    const lead = group.items[0];
    return {
      harvestReady: group.summary.harvestReadyTotal,
      bedCount: group.summary.bedCount,
      kind: cropKindOf(lead.productName, lead.category),
      maturity: lead.maturityPercent,
    };
  };

  return (
    <AppShell active="store">
      <View style={s.hero}>
        <PixelGlyph name="store" size={69} />
        <Text style={s.heroTitle}>매장 선택</Text>
        <View style={s.heroSub}>
          <Diamond />
          <Text style={s.heroSubText}>관리할 매장을 선택해주세요.</Text>
          <Diamond />
        </View>
      </View>

      <View style={s.listSection}>
        <View style={s.listHeading}>
          <View style={s.listHeadingTitle}>
            <PixelGlyph name="store" size={25} />
            <Text style={s.listHeadingText}>등록된 매장</Text>
          </View>
        </View>

        {loading && <StateNotice message="매장 목록을 불러오는 중…" />}
        {!loading && error && <StateNotice tone="error" message={error} onRetry={reload} />}
        {!loading && !error && projects.length === 0 && (
          <StateNotice message="등록된 매장이 없습니다." onRetry={reload} retryLabel="새로고침" />
        )}

        {!loading && !error && inventory.error && (
          <StateNotice tone="error" message={inventory.error} onRetry={inventory.reload} />
        )}

        <View style={s.cards}>
          {projects.map((project) => (
            <StoreCard
              key={project.id}
              name={project.name}
              statusLabel={projectStatusLabel(project.status)}
              facts={factsOf(project.id)}
              factsPlaceholder={inventory.loading ? "…" : "–"}
              selected={projectId === project.id}
              onSelect={() => setProjectId(project.id)}
            />
          ))}
        </View>
      </View>

      <View style={s.tip}>
        <PixelGlyph name="bulb" size={23} />
        <View style={s.tipCopy}>
          <Text style={s.tipTitle}>TIP</Text>
          <Text style={s.tipText}>매장을 선택하면 운영, 모니터링, 리포트 정보를 확인할 수 있어요.</Text>
        </View>
      </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  diamond: { width: 7, height: 7, backgroundColor: "#96866e", transform: [{ rotate: "45deg" }] },

  hero: { alignItems: "center", paddingVertical: 39, paddingTop: 39, paddingBottom: 35 },
  heroTitle: { marginTop: 12, fontSize: 31, letterSpacing: -1.4, color: C.ink, fontWeight: "700" },
  heroSub: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 12 },
  heroSubText: { color: "#444743", fontSize: 13 },

  listSection: { gap: 11 },
  listHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listHeadingTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  listHeadingText: { fontSize: 19, letterSpacing: -0.48, color: C.ink, fontWeight: "600" },

  cards: { gap: 12 },
  storeCard: {
    flexDirection: "row",
    minHeight: 154,
    gap: 11,
    borderWidth: 1,
    borderColor: "#ded5c9",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 10,
  },
  storeCardSelected: {
    borderWidth: 2,
    borderColor: C.green,
    padding: 9,
    shadowColor: "#1e603d",
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  thumbnail: {
    width: "41%",
    minHeight: 132,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#877e72",
    borderRadius: 8,
    backgroundColor: "#e8e5df",
  },
  thumbnailEmpty: { flex: 1, backgroundColor: "#e8e5df" },
  cardCopy: { flex: 1, justifyContent: "center", gap: 9 },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 },
  cardName: { flex: 1, fontSize: 20, letterSpacing: -0.9, color: C.ink, fontWeight: "700" },
  badgeSel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 30,
    borderRadius: 5,
    backgroundColor: C.green,
    paddingHorizontal: 7,
  },
  badgeSelText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  badgeChoose: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 30,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#bcb0a0",
    backgroundColor: "#fff",
    paddingHorizontal: 7,
  },
  chooseDot: { width: 11, height: 11, borderWidth: 1.5, borderColor: "#333", borderRadius: 6 },
  badgeChooseText: { color: "#333", fontSize: 9, fontWeight: "700" },

  storeFact: { flexDirection: "row", alignItems: "center", gap: 6 },
  factIcon: { width: 23, alignItems: "flex-start" },
  factIconEmpty: { width: 23, height: 23 },
  factLabel: { flex: 1, fontSize: 12, color: C.ink },
  factValue: { color: C.green, fontSize: 14, fontWeight: "600" },

  tip: {
    flexDirection: "row",
    gap: 9,
    borderWidth: 1,
    borderColor: "#6b9a75",
    borderRadius: 9,
    backgroundColor: "#fbfdf9",
    marginTop: 17,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tipCopy: { flex: 1, gap: 5 },
  tipTitle: { color: C.green, fontSize: 14, letterSpacing: 0.7, fontWeight: "700" },
  tipText: { color: "#454844", fontSize: 11, lineHeight: 16 },
});
