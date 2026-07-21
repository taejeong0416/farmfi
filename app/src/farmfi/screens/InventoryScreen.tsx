import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C } from "../theme";
import { LINKED_BEDS, STOCK_ROWS } from "../data";
import { AppShell, BranchSelect, CropPixel, MiniRackPlant, SectionTitle, TapScale } from "../components";

export default function InventoryScreen() {
  const [selected, setSelected] = useState<string>("butter");

  return (
    <AppShell active="inventory">
      <BranchSelect />
      <View style={s.intro}>
        <Text style={s.introTitle}>재고 · 생육 연동</Text>
        <Text style={s.introSub}>재고와 생육 상태를 함께 확인하세요.</Text>
      </View>

      {/* 매장 재고 현황 */}
      <View style={[s.card, s.stockCard]}>
        <SectionTitle>매장 재고 현황</SectionTitle>
        <View style={s.stockList}>
          {STOCK_ROWS.map((item) => (
            <TapScale
              key={item.kind}
              scaleTo={0.985}
              onPress={() => setSelected(item.kind)}
              style={[s.stockRow, selected === item.kind && s.stockRowSel]}
            >
              <CropPixel kind={item.kind} />
              <View style={s.stockMid}>
                <Text style={s.stockName}>{item.name}</Text>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${item.value}%` }]} />
                </View>
              </View>
              <Text style={s.stockQty}>
                {item.stock}<Text style={s.stockUnit}>팩</Text>
              </Text>
            </TapScale>
          ))}
        </View>
      </View>

      {/* 생장 연동 현황 */}
      <View style={[s.card, s.linkedCard]}>
        <View style={s.linkedTitle}>
          <SectionTitle>생장 연동 현황</SectionTitle>
        </View>
        <View style={s.linkedBeds}>
          {LINKED_BEDS.map((bed) => (
            <TapScale
              key={bed.rack}
              scaleTo={0.99}
              onPress={() => setSelected(bed.kind)}
              style={[s.linkedBed, selected === bed.kind && s.linkedBedSel]}
            >
              <View style={s.bedPreview}>
                <Text style={s.bedPreviewLabel}>베드 {bed.rack}</Text>
                <View style={s.bedPlants}>
                  {[0, 1, 2, 3].map((i) => (
                    <MiniRackPlant kind={bed.kind} key={i} />
                  ))}
                </View>
                <View style={s.bedSoil} />
              </View>
              <View style={s.linkedCol}>
                <Text style={s.linkedColB}>{bed.crop}</Text>
                <Text style={s.linkedColSmall}>
                  성숙도 <Text style={s.linkedColStrong}>{bed.maturity}%</Text>
                </Text>
              </View>
              <View style={s.linkedCol}>
                <Text style={s.linkedColSmall}>예상 수확</Text>
                <Text style={s.linkedColB}>{bed.harvest}</Text>
              </View>
              <View style={[s.linkedCol, s.linkedColLast]}>
                <Text style={s.linkedColSmall}>예상 수확량</Text>
                <Text style={s.linkedColYield}>
                  {bed.yield}<Text style={s.linkedColYieldEm}>팩</Text>
                </Text>
              </View>
            </TapScale>
          ))}
        </View>
      </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  intro: { paddingHorizontal: 4, paddingTop: 18, paddingBottom: 13 },
  introTitle: { fontSize: 29, letterSpacing: -1.6, color: C.ink, fontWeight: "700" },
  introSub: { marginTop: 9, color: "#4f524e", fontSize: 14 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: "#fff" },

  stockCard: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 11 },
  stockList: { marginTop: 10, gap: 4 },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 40,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  stockRowSel: { backgroundColor: "#f1f6ef", borderLeftWidth: 3, borderLeftColor: C.green },
  stockMid: { flex: 1 },
  stockName: { fontSize: 13, color: C.ink, marginBottom: 6 },
  bar: { height: 7, borderRadius: 99, backgroundColor: "#f0eeea", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99, backgroundColor: C.green },
  stockQty: { width: 47, fontSize: 14, color: C.ink, textAlign: "right", fontWeight: "600" },
  stockUnit: { fontSize: 9, fontWeight: "500" },

  linkedCard: { marginTop: 10, paddingHorizontal: 8, paddingTop: 13, paddingBottom: 7 },
  linkedTitle: { paddingHorizontal: 7 },
  linkedBeds: { marginTop: 9, gap: 5 },
  linkedBed: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 70,
    borderWidth: 1,
    borderColor: "#e2dcd4",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  linkedBedSel: { borderColor: "#86aa90", backgroundColor: "#f8fbf7" },
  bedPreview: { flex: 1.55, alignSelf: "stretch", justifyContent: "center", paddingLeft: 3, paddingRight: 7, borderRightWidth: 1, borderRightColor: "#e4dfd8" },
  bedPreviewLabel: { color: C.green, fontSize: 13, fontWeight: "700" },
  bedPlants: { flexDirection: "row", alignItems: "flex-end", height: 31, zIndex: 2 },
  bedSoil: {
    position: "absolute",
    right: 8 + 7,
    bottom: 5,
    left: 4,
    height: 6,
    borderWidth: 2,
    borderColor: "#493420",
    backgroundColor: "#74502e",
  },
  linkedCol: { flex: 0.95, minWidth: 0, paddingHorizontal: 7, borderRightWidth: 1, borderRightColor: "#e4dfd8" },
  linkedColLast: { flex: 0.72, borderRightWidth: 0, paddingRight: 1, alignItems: "center" },
  linkedColB: { fontSize: 11, color: C.ink },
  linkedColSmall: { marginTop: 5, color: "#5e625d", fontSize: 8 },
  linkedColStrong: { color: C.green, fontSize: 12 },
  linkedColYield: { marginTop: 5, color: C.green, fontSize: 15, fontWeight: "600" },
  linkedColYieldEm: { fontSize: 8, fontWeight: "400" },
});
