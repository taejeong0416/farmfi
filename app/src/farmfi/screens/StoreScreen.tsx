import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C } from "../theme";
import { AppIcon, PixelGlyph } from "../icons";
import { STORE_DATA, RACK_DATA, type RackId } from "../data";
import { AppShell, CropPixel, GrowthRackScene, SectionTitle, TapScale } from "../components";
import { useSelectedBranch } from "../branch";

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

function StoreCard({
  name,
  harvest,
  beds,
  rack,
  selected,
  onSelect,
}: {
  name: string;
  harvest: number;
  beds: number;
  rack: RackId;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TapScale onPress={onSelect} style={[s.storeCard, selected && s.storeCardSelected]}>
      <View style={s.thumbnail}>
        <GrowthRackScene rackId={rack} compact />
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
        <StoreFact icon={<PixelGlyph name="sprout" size={20} />} label="농장 상태" value="정상" />
        <StoreFact icon={<CropPixel kind={RACK_DATA[rack].kind} size="tiny" />} label="수확 가능" value={`${harvest}포기`} />
        <StoreFact icon={<PixelGlyph name="bed" size={20} />} label="재배 베드" value={`${beds}개`} />
      </View>
    </TapScale>
  );
}

export default function StoreScreen() {
  const [branch, setBranch] = useSelectedBranch();
  const [addMessage, setAddMessage] = useState("매장 추가");

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
          <TapScale
            style={s.addBtn}
            scaleTo={0.98}
            onPress={() => setAddMessage((c) => (c === "매장 추가" ? "준비 중" : "매장 추가"))}
          >
            <AppIcon name="plus" size={22} color={C.green} />
            <Text style={s.addBtnText}>{addMessage}</Text>
          </TapScale>
        </View>

        <View style={s.cards}>
          {STORE_DATA.map((store) => (
            <StoreCard
              {...store}
              selected={branch === store.name}
              onSelect={() => setBranch(store.name)}
              key={store.name}
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
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 38,
    borderWidth: 1.4,
    borderColor: C.green,
    borderRadius: 7,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
  },
  addBtnText: { color: C.green, fontSize: 13, fontWeight: "700" },

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
