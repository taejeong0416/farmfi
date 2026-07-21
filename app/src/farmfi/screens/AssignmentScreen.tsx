import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { C } from "../theme";
import { AppIcon } from "../icons";
import { OPERATOR_PORTRAIT, STORE_FLOOR_PLAN, TOMATO_BED } from "../assets";
import { AppShell, BranchSelect, SectionTitle, TapScale } from "../components";

// 매장 공간도 라벨 (원본 % 좌표, 대략 중심 정렬용 오프셋)
const FLOOR_LABELS: Array<{ text: string; left: string; top: string; w: number }> = [
  { text: "베드 A", left: "23%", top: "18%", w: 46 },
  { text: "베드 B", left: "77%", top: "18%", w: 46 },
  { text: "베드 C", left: "23%", top: "69%", w: 46 },
  { text: "베드 D", left: "77%", top: "69%", w: 46 },
  { text: "작업대", left: "50%", top: "43%", w: 40 },
  { text: "채소 판매 코너", left: "50%", top: "88%", w: 92 },
];

export default function AssignmentScreen() {
  const [message, setMessage] = useState("운영자 변경");

  return (
    <AppShell active="assignment">
      <BranchSelect />
      <View style={s.intro}>
        <Text style={s.introTitle}>운영자 배정</Text>
        <Text style={s.introSub}>매장의 운영자를 배정하고 근무 정보를 관리해주세요.</Text>
      </View>

      <View style={s.section}>
        <SectionTitle icon="users">현재 운영자</SectionTitle>
        <TapScale style={s.operatorCard} scaleTo={0.988} onPress={() => setMessage("운영자 상세 확인")}>
          <View style={s.operatorImageWrap}>
            <Image source={OPERATOR_PORTRAIT} style={s.operatorImage} contentFit="contain" contentPosition="bottom" />
          </View>
          <View style={s.operatorCopy}>
            <View style={s.operatorNameRow}>
              <Text style={s.operatorName}>운영자 1</Text>
              <View style={s.workBadge}>
                <Text style={s.workBadgeText}>근무 중</Text>
              </View>
            </View>
            <View style={s.operatorTime}>
              <AppIcon name="clock" size={18} color="#30322f" />
              <Text style={s.operatorTimeText}>오전 09:00 ~ 오후 06:00</Text>
            </View>
          </View>
          <Text style={s.chevronR}>›</Text>
        </TapScale>
      </View>

      <View style={s.floorSection}>
        <SectionTitle icon="sprout">매장 공간 구조</SectionTitle>
        <View style={s.floorPlan}>
          <Image source={STORE_FLOOR_PLAN} style={s.floorImage} contentFit="cover" />
          <View style={s.tomatoBed}>
            <Image source={TOMATO_BED} style={s.tomatoBedImg} contentFit="fill" />
          </View>
          {FLOOR_LABELS.map((l) => (
            <View
              key={l.text}
              style={[s.floorLabel, { left: l.left as `${number}%`, top: l.top as `${number}%`, marginLeft: -l.w / 2, marginTop: -11 }]}
            >
              <Text style={s.floorLabelText}>{l.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <TapScale
        style={s.changeBtn}
        scaleTo={0.98}
        onPress={() => setMessage((c) => (c === "운영자 변경" ? "운영자 선택 열기" : "운영자 변경"))}
      >
        <AppIcon name="user" size={23} color="#fff" />
        <Text style={s.changeBtnText}>{message}</Text>
      </TapScale>
    </AppShell>
  );
}

const s = StyleSheet.create({
  intro: { paddingTop: 21, paddingBottom: 13, alignItems: "center" },
  introTitle: { fontSize: 30, letterSpacing: -1.6, color: C.ink, fontWeight: "700" },
  introSub: { marginTop: 9, color: "#4f524e", fontSize: 13, textAlign: "center" },

  section: { marginTop: 8 },
  operatorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 108,
    borderWidth: 1,
    borderColor: "#d9d1c7",
    borderRadius: 10,
    backgroundColor: "#fff",
    marginTop: 9,
    paddingLeft: 8,
    paddingRight: 14,
  },
  operatorImageWrap: { width: 84, height: 101, alignSelf: "flex-end", overflow: "hidden" },
  operatorImage: { width: "100%", height: "100%" },
  operatorCopy: { flex: 1 },
  operatorNameRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  operatorName: { fontSize: 24, letterSpacing: -1.2, color: C.ink, fontWeight: "700" },
  workBadge: { borderRadius: 5, backgroundColor: C.green, paddingHorizontal: 8, paddingVertical: 6 },
  workBadgeText: { color: "#fff", fontSize: 10 },
  operatorTime: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 11 },
  operatorTimeText: { color: "#30322f", fontSize: 12 },
  chevronR: { fontSize: 35, fontWeight: "300", color: C.ink },

  floorSection: { marginTop: 15 },
  floorPlan: {
    aspectRatio: 1.09,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#8a8175",
    borderRadius: 6,
    marginTop: 9,
    backgroundColor: "#eee9dd",
  },
  floorImage: { width: "100%", height: "100%" },
  tomatoBed: { position: "absolute", top: "55.1%", left: "60.5%", width: "30.2%", height: "20.5%", overflow: "hidden" },
  tomatoBedImg: { width: "100%", height: "100%", transform: [{ scaleX: 1.52 }, { scaleY: 1.78 }] },
  floorLabel: {
    position: "absolute",
    borderRadius: 3,
    backgroundColor: "rgba(45,42,36,0.72)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  floorLabelText: { color: "#fff", fontSize: 13 },

  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: C.green,
    marginTop: 12,
  },
  changeBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
