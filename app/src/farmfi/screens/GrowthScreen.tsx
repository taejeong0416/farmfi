import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { C } from "../theme";
import { AppIcon, PixelGlyph } from "../icons";
import { RACK_DATA, type RackId } from "../data";
import { AppShell, BranchSelect, GrowthRackScene, SectionTitle } from "../components";

function Diamond() {
  return <View style={s.diamond} />;
}

const RACKS: RackId[] = ["A", "B", "C", "D"];

export default function GrowthScreen() {
  const [rackId, setRackId] = useState<RackId>("A");
  const rack = RACK_DATA[rackId];

  // 베드 전환 시 페이드 인 (원본 AnimatePresence 전환 대체)
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = 0;
    op.value = withTiming(1, { duration: 220, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [rackId, op]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <AppShell active="growth">
      <BranchSelect />
      <View style={s.hero}>
        <PixelGlyph name="sprout" size={47} />
        <Text style={s.heroTitle}>성장 모니터링</Text>
        <View style={s.heroSub}>
          <Diamond />
          <Text style={s.heroSubText}>실시간으로 작물의 성장 상태를 확인하세요.</Text>
          <Diamond />
        </View>
      </View>

      <View style={s.metrics}>
        <View style={s.metric}>
          <View style={s.metricLabelRow}>
            <PixelGlyph name="sprout" size={18} />
            <Text style={s.metricLabel}>농장 컨디션</Text>
          </View>
          <Text style={s.metricValue}>96<Text style={s.metricUnit}>%</Text></Text>
        </View>
        <View style={s.metric}>
          <View style={s.metricLabelRow}>
            <PixelGlyph name="basket" size={18} />
            <Text style={s.metricLabel}>오늘 수확 가능</Text>
          </View>
          <Text style={s.metricValue}>38<Text style={s.metricUnit}>포기</Text></Text>
        </View>
        <View style={s.metric}>
          <View style={s.metricLabelRow}>
            <PixelGlyph name="bars" size={18} />
            <Text style={s.metricLabel}>7월 생산량</Text>
          </View>
          <Text style={s.metricValue}>412<Text style={s.metricUnit}>/ 500</Text></Text>
        </View>
      </View>

      <Link href="/farm/monitoring" style={s.monitorBtn}>
        상세 센서 모니터링 →
      </Link>

      <View style={s.bedSection}>
        <SectionTitle icon="sprout">실시간 성장 베드</SectionTitle>
        <View style={s.bedTabs}>
          {RACKS.map((r, i) => {
            const on = rackId === r;
            return (
              <Text
                key={r}
                onPress={() => setRackId(r)}
                style={[
                  s.bedTab,
                  i === 0 && s.bedTabFirst,
                  i === RACKS.length - 1 && s.bedTabLast,
                  i > 0 && s.bedTabNoLeft,
                  on && s.bedTabActive,
                ]}
              >
                베드 {r}
              </Text>
            );
          })}
        </View>
        <Animated.View style={[s.rackCard, cardStyle]}>
          <View style={s.rackImage}>
            <GrowthRackScene rackId={rackId} />
            <View style={s.stageBadge}>
              <Text style={s.stageBadgeText}>{rack.crop} · {rack.stage} {rack.maturity}%</Text>
            </View>
          </View>
          <View style={s.rackStatus}>
            <View style={s.statusSide}>
              <AppIcon name="check" size={30} color={C.green} />
              <View>
                <Text style={s.statusSmall}>생육 상태</Text>
                <Text style={s.statusB}>{rack.state}</Text>
              </View>
            </View>
            <View style={s.statusDivider} />
            <View style={s.statusSide}>
              <AppIcon name="drop" size={30} color={C.green} />
              <View>
                <Text style={s.statusSmall}>습도</Text>
                <Text style={s.statusB}>{rack.humidity}%</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  diamond: { width: 7, height: 7, backgroundColor: "#9b8c73", transform: [{ rotate: "45deg" }] },

  hero: { alignItems: "center", paddingTop: 13, paddingBottom: 12 },
  heroTitle: { marginTop: 7, fontSize: 29, letterSpacing: -1.2, color: C.ink, fontWeight: "700" },
  heroSub: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 9 },
  heroSubText: { color: "#474a46", fontSize: 13 },

  metrics: { flexDirection: "row", gap: 7 },
  metric: {
    flex: 1,
    minHeight: 91,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d9d1c5",
    borderRadius: 10,
    backgroundColor: "#fffefa",
    paddingHorizontal: 3,
    paddingVertical: 8,
  },
  metricLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricLabel: { fontSize: 10, fontWeight: "600", color: "#333" },
  metricValue: { marginTop: 8, color: C.green, fontSize: 25, letterSpacing: -1, fontWeight: "700" },
  metricUnit: { color: "#151715", fontSize: 12, fontWeight: "500" },

  monitorBtn: {
    marginTop: 12,
    height: 46,
    lineHeight: 46,
    textAlign: "center",
    backgroundColor: C.green,
    color: "#fff",
    borderRadius: 10,
    fontWeight: "700",
    fontSize: 14,
    overflow: "hidden",
  },

  bedSection: { marginTop: 18 },
  bedTabs: { flexDirection: "row", marginTop: 10 },
  bedTab: {
    flex: 1,
    height: 41,
    lineHeight: 41,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#d6cec2",
    backgroundColor: "#fff",
    fontSize: 13,
    color: C.ink,
  },
  bedTabFirst: { borderTopLeftRadius: 9 },
  bedTabLast: { borderTopRightRadius: 9 },
  bedTabNoLeft: { borderLeftWidth: 0 },
  bedTabActive: { borderColor: C.green, backgroundColor: C.green, color: "#fff", fontWeight: "700" },

  rackCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
    backgroundColor: "#fff",
  },
  rackImage: { aspectRatio: 1.25, overflow: "hidden", backgroundColor: "#f4f3ef" },
  stageBadge: {
    position: "absolute",
    top: 9,
    left: 9,
    borderWidth: 1,
    borderColor: "rgba(30,96,61,0.26)",
    borderRadius: 5,
    backgroundColor: "rgba(255,254,250,0.91)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stageBadgeText: { color: C.greenDark, fontSize: 10, fontWeight: "700" },

  rackStatus: { flexDirection: "row", alignItems: "center", minHeight: 66 },
  statusSide: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  statusDivider: { width: 1, height: 44, backgroundColor: "#ddd7ce" },
  statusSmall: { color: "#666862", fontSize: 11 },
  statusB: { color: C.green, fontSize: 17, fontWeight: "600" },
});
