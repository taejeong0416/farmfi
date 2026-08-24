// 앱 껍데기 — 상단 바, 하단 탭, 상세 헤더, 팝업.
// Figma의 Status Bar·Home Indicator 프레임은 기기 크롬을 흉내 낸 목업이라 옮기지
// 않는다. 실제 기기에서는 OS가 그리고 SafeAreaView가 자리를 잡는다.
import { useEffect, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname, useRouter, type Href } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useFarmProjects } from "../branch";
import { C, FRAME_MAX_WIDTH, FS, FW, GUTTER, R, SP } from "../theme";
import { AppIcon, type IconName } from "../icons";
import { PrimaryButton, GhostButton, T } from "./primitives";
import { isAuthError } from "@/lib/api";

// typedRoutes가 켜져 있어 Href 유니온은 `.expo/types`가 생성될 때만 새 경로를 안다.
// 라우트를 추가할 때마다 호출부에서 캐스팅하지 않도록 여기 한 곳에서만 좁힌다.
export function useGo() {
  const router = useRouter();
  return {
    push: (path: string) => router.push(path as Href),
    replace: (path: string) => router.replace(path as Href),
    back: () => router.back(),
  };
}

// ─── 하단 탭 ───
export type TabKey = "dashboard" | "growth" | "monitoring" | "inventory" | "sales";

const TABS: { key: TabKey; label: string; icon: IconName; href: string }[] = [
  { key: "dashboard", label: "대시보드", icon: "report", href: "/farm/dashboard" },
  { key: "growth", label: "운영", icon: "sprout", href: "/farm/growth" },
  { key: "monitoring", label: "모니터링", icon: "monitor", href: "/farm/monitoring" },
  { key: "inventory", label: "연동", icon: "link", href: "/farm/inventory" },
  { key: "sales", label: "리포트", icon: "bars", href: "/farm/sales" },
];

function BottomNav({ active }: { active: TabKey }) {
  const go = useGo();
  const pathname = usePathname();
  return (
    <View style={s.nav}>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            style={s.navItem}
            onPress={() => {
              if (pathname !== t.href) go.replace(t.href);
            }}
          >
            <AppIcon name={t.icon} size={24} color={on ? C.brand : C.muted} />
            <Text style={[s.navLabel, on && s.navLabelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── 탭 화면 상단 바 (로고 + 설정) ───
function TopBar({ storeName, onStorePress }: { storeName?: string; onStorePress?: () => void }) {
  const go = useGo();
  return (
    <View style={s.topBar}>
      <Text style={s.logo}>FarmFi</Text>
      <View style={s.topBarRight}>
        {storeName && (
          <Pressable style={s.storeBtn} onPress={onStorePress} hitSlop={8}>
            <Text style={s.storeName} numberOfLines={1}>
              {storeName}
            </Text>
            <AppIcon name="chevron-down" size={14} color={C.body} />
          </Pressable>
        )}
        <Pressable onPress={() => go.push("/farm/settings")} hitSlop={8}>
          <AppIcon name="settings" size={20} color={C.muted} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── 탭 화면 셸 ───
/**
 * 지점 로딩 실패를 화면 대신 셸이 말한다.
 *
 * 매장 화면은 전부 `projectId`로 API 경로를 만들고, `useApiResource`는 path가
 * null이면 요청하지 않고 loading을 유지한다. 그래서 지점 목록을 못 불러오면
 * 화면이 스켈레톤만 영원히 띄운다 — 이유도, 재시도 버튼도, 로그인 안내도 없이.
 * 로그인이 풀렸을 때가 대표적이다.
 *
 * 화면 16개가 같은 함정을 공유하므로 각자 고치지 않고 셸에서 한 번 막는다.
 */
function useBranchGate(children: ReactNode, enabled: boolean): ReactNode {
  const go = useGo();
  const branch = useFarmProjects();

  if (!enabled) return children;

  if (branch.error) {
    return (
      <>
        <StateNotice tone="error" message={branch.error} onRetry={branch.reload} />
        {isAuthError(branch.rawError) && (
          <PrimaryButton label="로그인하러 가기" onPress={() => go.push("/login")} />
        )}
      </>
    );
  }

  if (!branch.loading && branch.projects.length === 0) {
    return (
      <StateNotice
        tone="info"
        message="배정된 매장이 없습니다. 관리자에게 매장 배정을 요청해 주세요."
        onRetry={branch.reload}
      />
    );
  }

  return children;
}

export function AppShell({
  active,
  storeName,
  onStorePress,
  children,
  scroll = true,
}: {
  active: TabKey;
  storeName?: string;
  onStorePress?: () => void;
  children: ReactNode;
  scroll?: boolean;
}) {
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [enter]);
  const aStyle = useAnimatedStyle(() => ({ opacity: enter.value }));

  const body = useBranchGate(children, true);

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <Animated.View style={[s.frame, aStyle]}>
        <TopBar storeName={storeName} onStorePress={onStorePress} />
        {scroll ? (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        ) : (
          <View style={[s.content, { flex: 1 }]}>{body}</View>
        )}
        <BottomNav active={active} />
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── 상세 화면 셸 (뒤로가기 헤더) ───
export function DetailShell({
  title,
  subtitle,
  action,
  children,
  footer,
  scroll = true,
  requiresProject = false,
}: {
  title: string;
  subtitle?: string;
  action?: { icon: IconName; onPress: () => void };
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** 이 화면이 선택된 매장(projectId)에 의존하면 true. 지점 로딩 실패를 셸이 안내한다. */
  requiresProject?: boolean;
}) {
  const go = useGo();
  const body = useBranchGate(children, requiresProject);
  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <View style={s.frame}>
        <View style={s.detailHeader}>
          <Pressable onPress={go.back} hitSlop={10} style={s.backBtn}>
            <AppIcon name="chevron-left" size={22} color={C.body} />
          </Pressable>
          <View style={s.detailTitleCol}>
            <Text style={s.detailTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && (
              <Text style={s.detailSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          {action && (
            <Pressable onPress={action.onPress} hitSlop={10}>
              <AppIcon name={action.icon} size={20} color={C.body} />
            </Pressable>
          )}
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        ) : (
          <View style={[s.content, { flex: 1 }]}>{body}</View>
        )}
        {footer && <View style={s.footer}>{footer}</View>}
      </View>
    </SafeAreaView>
  );
}

// ─── 팝업 ───
// 20 제어 성공 · 21 제어 실패 · 22 재고 부족 · 23 로그아웃 확인이 모두 이 모양이다.
export function Popup({
  visible,
  glyph = "✓",
  tone = "brand",
  title,
  message,
  confirmLabel = "확인",
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  glyph?: string;
  tone?: "brand" | "danger";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.popup}>
          <View style={[s.popupIcon, tone === "danger" && { backgroundColor: C.surface }]}>
            <Text style={[s.popupGlyph, tone === "danger" && { color: C.danger }]}>{glyph}</Text>
          </View>
          <T v="title" style={s.popupTitle}>
            {title}
          </T>
          <Text style={s.popupMessage}>{message}</Text>
          <View style={s.popupActions}>
            {cancelLabel && (
              <GhostButton label={cancelLabel} onPress={onCancel} style={{ flex: 1 }} />
            )}
            <PrimaryButton label={confirmLabel} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── 로딩 / 오류 안내 ───
// API가 실패하면 옛 값이나 목데이터로 되돌아가지 않고 여기서 사실을 말한다.
export function StateNotice({
  tone = "info",
  message,
  onRetry,
}: {
  tone?: "info" | "error";
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={s.notice}>
      <Text style={[s.noticeText, tone === "error" && { color: C.danger }]}>{message}</Text>
      {onRetry && <GhostButton label="다시 시도" onPress={onRetry} tone="brand" style={s.noticeBtn} />}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: C.surface },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: "center",
    backgroundColor: C.paper,
  },
  content: { paddingHorizontal: GUTTER, paddingTop: SP.lg, paddingBottom: SP.xl, gap: SP.xl },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: GUTTER,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  logo: { fontSize: FS.h2, fontWeight: FW.bold, color: C.brand, letterSpacing: -0.5 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: SP.md },
  storeBtn: { flexDirection: "row", alignItems: "center", gap: SP.xs, maxWidth: 140 },
  storeName: { fontSize: FS.md, fontWeight: FW.semibold, color: C.ink },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    minHeight: 56,
    paddingHorizontal: GUTTER,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  backBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  detailTitleCol: { flex: 1 },
  detailTitle: { fontSize: FS.xl, fontWeight: FW.semibold, color: C.ink },
  detailSubtitle: { fontSize: FS.sm, color: C.body, marginTop: 2 },

  footer: {
    padding: GUTTER,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
    backgroundColor: C.paper,
    gap: SP.sm,
  },

  nav: {
    flexDirection: "row",
    minHeight: 64,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
    backgroundColor: C.paper,
    paddingVertical: SP.sm,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navLabel: { fontSize: FS.sm, color: C.muted },
  navLabelOn: { color: C.brand, fontWeight: FW.semibold },

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
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  popupGlyph: { fontSize: FS.h1, color: C.brand },
  popupTitle: { textAlign: "center" },
  popupMessage: { fontSize: FS.sm, color: C.body, textAlign: "center", lineHeight: 19 },
  popupActions: { flexDirection: "row", gap: SP.sm, alignSelf: "stretch", marginTop: SP.xs },

  notice: { alignItems: "center", gap: SP.md, paddingVertical: SP.xxl, paddingHorizontal: SP.lg },
  noticeText: { fontSize: FS.cap, color: C.body, textAlign: "center", lineHeight: 19 },
  noticeBtn: { alignSelf: "center" },
});
