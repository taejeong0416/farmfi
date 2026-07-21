import { useEffect, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { C, FRAME_MAX_WIDTH } from "./theme";
import { AppIcon, PixelGlyph, type IconName } from "./icons";
import { BRANCHES, CROP_CELL, LEAFY_SLOTS, RACK_DATA, TOMATO_SLOTS, type CropKind, type RackId, type ServiceKey } from "./data";
import { CROP_PLANT, CROP_SPRITE, RACK_BASE } from "./assets";
import { useSelectedBranch } from "./branch";

// ─── 하단 탭 정의 (원본 APP_TABS, href는 expo-router 경로로) ───
const APP_TABS: Array<{ key: ServiceKey; label: string; icon: IconName; href: string }> = [
  { key: "store", label: "매장", icon: "store", href: "/farm/store" },
  { key: "assignment", label: "운영", icon: "sprout", href: "/farm/assignment" },
  { key: "growth", label: "모니터링", icon: "monitor", href: "/farm/growth" },
  { key: "inventory", label: "연동", icon: "link", href: "/farm/inventory" },
  { key: "sales", label: "리포트", icon: "report", href: "/farm/sales" },
];

// ─── 탭 눌림 스케일 애니메이션 (원본 whileTap) ───
export function TapScale({
  children,
  onPress,
  style,
  scaleTo = 0.985,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={aStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => (scale.value = withTiming(scaleTo, { duration: 90 }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: 140 }))}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── 작물 스프라이트 크롭 (원본 background-position, 3열×2행) ───
const CROP_SIZE = { tiny: 23, small: 31, medium: 40, large: 54 } as const;
export function CropPixel({ kind, size = "medium" }: { kind: CropKind; size?: keyof typeof CROP_SIZE }) {
  const px = CROP_SIZE[size];
  const cell = CROP_CELL[kind];
  return (
    <View style={{ width: px, height: px, overflow: "hidden" }}>
      <Image
        source={CROP_SPRITE}
        style={{
          width: px * 3,
          height: px * 2,
          transform: [{ translateX: -cell.col * px }, { translateY: -cell.row * px }],
        }}
        contentFit="fill"
      />
    </View>
  );
}

// ─── 재배 베드 식물 (sway 애니메이션) ───
function RackPlant({ kind, index, maturity }: { kind: CropKind; index: number; maturity: number }) {
  const isTomato = kind === "tomato";
  const slots = isTomato ? TOMATO_SLOTS : LEAFY_SLOTS;
  const slot = slots[index];
  const asset = CROP_PLANT[kind];
  const stageScale = kind === "butter" ? 0.95 : kind === "romaine" ? 0.87 : kind === "basil" ? 0.84 : 0.9;
  const maturityScale = 0.86 + (maturity / 100) * 0.14;
  const plantScale = stageScale * maturityScale * (0.96 + (index % 3) * 0.025);
  const baseW = isTomato ? 80 : 52;
  const baseH = isTomato ? 112 : 58;
  const transY = isTomato ? 9 : 5;

  const rot = useSharedValue(isTomato ? -0.8 : -1.1);
  useEffect(() => {
    const to = isTomato ? 0.9 : 1.25;
    const from = isTomato ? -0.8 : -1.1;
    const dur = (isTomato ? 4400 : 3800) / 2;
    rot.value = withRepeat(
      withSequence(
        withTiming(to, { duration: dur, easing: Easing.inOut(Easing.ease) }),
        withTiming(from, { duration: dur, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [isTomato, rot]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: transY }, { scale: plantScale }, { rotateZ: `${rot.value}deg` }],
  }));

  return (
    <View
      style={{
        position: "absolute",
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        width: baseW,
        height: baseH,
        marginLeft: -baseW / 2,
        marginTop: -baseH,
      }}
      pointerEvents="none"
    >
      <Animated.View style={[{ width: "100%", height: "100%" }, aStyle]}>
        <Image source={asset.src} style={{ width: "100%", height: "100%" }} contentFit="contain" contentPosition="bottom" />
      </Animated.View>
    </View>
  );
}

export function GrowthRackScene({ rackId, compact = false }: { rackId: RackId; compact?: boolean }) {
  const rack = RACK_DATA[rackId];
  const isTomato = rack.kind === "tomato";
  const slots = isTomato ? TOMATO_SLOTS : LEAFY_SLOTS;
  const scale = compact ? (isTomato ? 0.5 : 0.48) : 1;
  return (
    <View style={styles.rackScene}>
      <Image source={isTomato ? RACK_BASE.tomato : RACK_BASE.leafy} style={styles.rackBase} contentFit="cover" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {compact ? (
          <View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
            {slots.map((_, i) => (
              <RackPlant kind={rack.kind} index={i} maturity={rack.maturity} key={`${rackId}-${i}`} />
            ))}
          </View>
        ) : (
          slots.map((_, i) => <RackPlant kind={rack.kind} index={i} maturity={rack.maturity} key={`${rackId}-${i}`} />)
        )}
      </View>
    </View>
  );
}

export function MiniRackPlant({ kind }: { kind: CropKind }) {
  const asset = CROP_PLANT[kind];
  const isTomato = kind === "tomato";
  return (
    <Image
      source={asset.src}
      style={{ width: 24, height: isTomato ? 31 : 28, marginLeft: -5, transform: [{ translateY: 4 }] }}
      contentFit="contain"
      contentPosition="bottom"
    />
  );
}

// ─── 섹션 타이틀 ───
export function SectionTitle({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      {icon &&
        (icon === "sprout" ? (
          <PixelGlyph name="sprout" size={21} />
        ) : icon === "users" ? (
          <PixelGlyph name="users" size={24} />
        ) : (
          <AppIcon name={icon} size={20} color={C.green} />
        ))}
      <Text style={styles.sectionTitleText}>{children}</Text>
    </View>
  );
}

// ─── 지점 선택 (원본 <select> → 모달 드롭다운) ───
export function BranchSelect({ calendar = false }: { calendar?: boolean }) {
  const [branch, setBranch] = useSelectedBranch();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.branchRow}>
      <Pressable style={styles.branchSelect} onPress={() => setOpen(true)}>
        <PixelGlyph name="store" size={24} />
        <Text style={styles.branchText} numberOfLines={1}>{branch}</Text>
        <View style={styles.chevron} />
      </Pressable>
      {calendar && (
        <Pressable style={styles.calendarBtn}>
          <AppIcon name="calendar" size={25} color={C.ink} />
        </Pressable>
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet}>
            {BRANCHES.map((b) => (
              <Pressable
                key={b}
                style={styles.modalItem}
                onPress={() => {
                  setBranch(b);
                  setOpen(false);
                }}
              >
                <Text style={[styles.modalItemText, b === branch && { color: C.green, fontWeight: "700" }]}>{b}</Text>
                {b === branch && <AppIcon name="check" size={18} color={C.green} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── 하단 네비게이션 ───
function BottomNavigation({ active }: { active: ServiceKey }) {
  const router = useRouter();
  const softBg = active === "growth" || active === "inventory";
  return (
    <View style={styles.bottomNav}>
      {APP_TABS.map((item) => {
        const on = item.key === active;
        return (
          <Pressable
            key={item.key}
            style={[styles.navItem, on && softBg && styles.navItemSoft]}
            onPress={() => {
              if (!on) router.replace(item.href as never);
            }}
          >
            <AppIcon name={item.icon} size={25} color={on ? C.green : "#676a67"} />
            <Text style={[styles.navLabel, on && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── 앱 셸 (프레임 + 콘텐츠 스크롤 + 하단 네비) ───
export function AppShell({ active, children }: { active: ServiceKey; children: ReactNode }) {
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [enter]);
  const aStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 8 }],
  }));
  return (
    <SafeAreaView style={styles.stage} edges={["top", "bottom"]}>
      <Animated.View style={[styles.frame, aStyle]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        <BottomNavigation active={active} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: C.stageBg },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: "center",
    backgroundColor: C.paper,
  },
  content: { paddingHorizontal: 23, paddingTop: 14, paddingBottom: 24 },

  branchRow: { flexDirection: "row", minHeight: 46, alignItems: "center", justifyContent: "space-between", gap: 12 },
  branchSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 184,
    height: 44,
    borderWidth: 1.5,
    borderColor: "#4f875f",
    borderRadius: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
  },
  branchText: { flex: 1, fontSize: 15, fontWeight: "600", color: C.ink },
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: C.green,
    transform: [{ rotate: "45deg" }, { translateY: -2 }],
  },
  calendarBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", justifyContent: "center", padding: 40 },
  modalSheet: { backgroundColor: "#fff", borderRadius: 12, overflow: "hidden" },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  modalItemText: { fontSize: 16, color: C.ink },

  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitleText: { fontSize: 18, letterSpacing: -0.45, color: C.ink, fontWeight: "600" },

  rackScene: { flex: 1, width: "100%", height: "100%", overflow: "hidden", backgroundColor: "#f4f3ef" },
  rackBase: { width: "100%", height: "100%" },

  bottomNav: {
    flexDirection: "row",
    minHeight: 76,
    borderTopWidth: 1,
    borderTopColor: "#e3dfd8",
    backgroundColor: "rgba(255,254,250,0.97)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  navItemSoft: { backgroundColor: C.greenSoft },
  navLabel: { marginTop: 5, fontSize: 10, fontWeight: "500", color: "#676a67" },
  navLabelActive: { color: C.green, fontWeight: "700" },
});

export { styles as shellStyles };
