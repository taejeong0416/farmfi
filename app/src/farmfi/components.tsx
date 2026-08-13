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
import { CROP_CELL, LEAFY_SLOTS, TOMATO_SLOTS, type CropKind, type ServiceKey } from "./data";
import { CROP_PLANT, CROP_SPRITE, RACK_BASE } from "./assets";
import { useFarmProjects } from "./branch";

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
function RackPlant({ kind, index, maturity, scaleMul = 1 }: { kind: CropKind; index: number; maturity: number; scaleMul?: number }) {
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
    transform: [{ translateY: transY }, { scale: plantScale * scaleMul }, { rotateZ: `${rot.value}deg` }],
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
      <Animated.View style={[{ width: "100%", height: "100%", transformOrigin: "50% 100%" }, aStyle]}>
        <Image source={asset.src} style={{ width: "100%", height: "100%" }} contentFit="contain" contentPosition="bottom" />
      </Animated.View>
    </View>
  );
}

// 베드 장면 — 작물 종류와 성숙도는 호출자가 API에서 받아 넘긴다.
export function GrowthRackScene({
  kind,
  maturity,
  compact = false,
}: {
  kind: CropKind;
  maturity: number;
  compact?: boolean;
}) {
  const isTomato = kind === "tomato";
  const slots = isTomato ? TOMATO_SLOTS : LEAFY_SLOTS;
  // compact(썸네일)은 슬롯 위치는 유지하고 각 식물만 개별 축소 (원본 CSS와 동일).
  const scaleMul = compact ? (isTomato ? 0.5 : 0.48) : 1;
  return (
    <View style={styles.rackScene}>
      <Image source={isTomato ? RACK_BASE.tomato : RACK_BASE.leafy} style={styles.rackBase} contentFit="cover" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {slots.map((_, i) => (
          <RackPlant kind={kind} index={i} maturity={maturity} scaleMul={scaleMul} key={`${kind}-${i}`} />
        ))}
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

// ─── 지점 선택 (원본 <select> → 모달 드롭다운) — 목록은 GET /api/projects ───
export function BranchSelect({ calendar = false }: { calendar?: boolean }) {
  const { projects, projectId, project, setProjectId, loading, error } = useFarmProjects();
  const [open, setOpen] = useState(false);

  // 지점명을 아직 모르는 상태를 임의의 기본값으로 덮지 않는다.
  const label = project?.name ?? (loading ? "불러오는 중…" : error ? "불러오기 실패" : "지점 없음");
  const selectable = projects.length > 0;

  return (
    <View style={styles.branchRow}>
      <Pressable
        style={[styles.branchSelect, !selectable && styles.branchSelectMuted]}
        onPress={() => selectable && setOpen(true)}
      >
        <PixelGlyph name="store" size={24} />
        <Text style={[styles.branchText, !project && styles.branchTextMuted]} numberOfLines={1}>
          {label}
        </Text>
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
            {projects.map((p) => (
              <Pressable
                key={p.id}
                style={styles.modalItem}
                onPress={() => {
                  setProjectId(p.id);
                  setOpen(false);
                }}
              >
                <Text style={[styles.modalItemText, p.id === projectId && { color: C.green, fontWeight: "700" }]}>
                  {p.name}
                </Text>
                {p.id === projectId && <AppIcon name="check" size={18} color={C.green} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── 로딩 / 오류 / 빈 상태 ───
// API가 실패하면 목데이터로 되돌아가지 않고 반드시 이 컴포넌트로 사실을 말한다.
export function StateNotice({
  tone = "info",
  message,
  onRetry,
  retryLabel = "다시 시도",
}: {
  tone?: "info" | "error";
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.stateNotice}>
      <Text style={[styles.stateNoticeText, tone === "error" && styles.stateNoticeTextErr]}>
        {message}
      </Text>
      {onRetry && (
        <TapScale style={styles.stateRetry} scaleTo={0.97} onPress={onRetry}>
          <Text style={styles.stateRetryText}>{retryLabel}</Text>
        </TapScale>
      )}
    </View>
  );
}

// ─── 데이터 기준일 ───
// 화면의 수치가 언제 시점의 것인지 밝힌다. API가 stale=true를 줄 때만 나타난다 —
// 데이터가 계속 들어오는 지점에서는 기준일이 곧 오늘이라 표기할 이유가 없다.
export function DataAsOf({ dataAsOf, stale }: { dataAsOf: string | null; stale: boolean }) {
  if (!stale || !dataAsOf) return null;
  const d = new Date(dataAsOf);
  if (Number.isNaN(d.getTime())) return null;
  const label = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return <Text style={styles.dataAsOf}>데이터 기준일 {label}</Text>;
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
  branchSelectMuted: { borderColor: "#c3bcb0" },
  branchText: { flex: 1, fontSize: 15, fontWeight: "600", color: C.ink },
  branchTextMuted: { color: "#8a8880" },
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

  stateNotice: { alignItems: "center", paddingVertical: 22, paddingHorizontal: 12 },
  stateNoticeText: { color: "#666862", fontSize: 13, textAlign: "center", lineHeight: 19 },
  stateNoticeTextErr: { color: "#c0492f" },
  dataAsOf: { color: "#8a8c86", fontSize: 11, textAlign: "center", marginTop: 6 },
  stateRetry: {
    minHeight: 44,
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 20,
    borderWidth: 1.4,
    borderColor: C.green,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  stateRetryText: { color: C.green, fontSize: 13, fontWeight: "700", textAlign: "center" },

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
