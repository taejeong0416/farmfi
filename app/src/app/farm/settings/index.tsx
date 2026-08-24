// 18 설정 (+ 23 로그아웃 확인)
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

import { useAuth } from "@/lib/auth";
import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { alertKind, type NotificationsResponse } from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import { Card, DetailShell, Divider, Popup, useGo } from "@/farmfi/ui";

export default function SettingsScreen() {
  const go = useGo();
  const { user, logout } = useAuth();
  const { project, projects } = useFarmProjects();
  const [confirming, setConfirming] = useState(false);

  // 알림 설정 줄에 붙는 요약은 실제 미확인 알림 수에서 온다.
  const notif = useApiResource<NotificationsResponse>(
    project ? `/api/notifications?projectId=${project.id}&unreadOnly=1` : null,
    "알림 수를 불러오지 못했습니다."
  );
  const unread = notif.data?.notifications ?? [];
  const criticalCount = unread.filter((n) => alertKind(n.type).severity === "critical").length;

  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <DetailShell title="설정">
      {/* 계정 */}
      <Card style={s.profileCard}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(user?.name ?? "운").slice(0, 1)}</Text>
        </View>
        <View style={s.profileCopy}>
          <Text style={s.profileName}>{user?.name ?? "운영자"}</Text>
          <Text style={s.profileSub}>
            매장 운영자{project ? ` · ${project.name}` : ""}
          </Text>
        </View>
      </Card>

      {/* 매장 */}
      <Group title="매장">
        <NavRow
          label="현재 매장"
          value={project?.name ?? "선택 안 됨"}
          onPress={() => go.push("/store-select")}
        />
        <Divider />
        <NavRow
          label="매장 전환"
          value={`${projects.length}곳`}
          onPress={() => go.push("/store-select")}
        />
      </Group>

      {/* 알림 */}
      <Group title="알림">
        <NavRow
          label="알림 설정"
          badge={unread.length > 0 ? `미확인 ${unread.length} · 위험 ${criticalCount}` : undefined}
          onPress={() => go.push("/farm/settings/notifications")}
        />
      </Group>

      {/* 정보 */}
      <Group title="정보">
        {/* Figma에 약관 화면이 없다. 열 곳이 없으므로 화살표를 달지 않는다. */}
        <NavRow label="이용약관" value="준비 중" />
        <Divider />
        <NavRow label="버전" value={version} />
      </Group>

      <Pressable style={s.logout} onPress={() => setConfirming(true)}>
        <Text style={s.logoutText}>로그아웃</Text>
      </Pressable>

      <Popup
        visible={confirming}
        glyph="!"
        title="로그아웃할까요?"
        message={"현재 기기의 세션이 종료됩니다.\n저장하지 않은 입력은 사라져요."}
        cancelLabel="취소"
        confirmLabel="로그아웃"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await logout();
          // 표식을 붙여야 로그인 화면이 머문다. 없으면 화면이 스플래시로 되돌리고,
          // 스플래시는 세션이 없으면 다시 발급받는다 — 로그아웃한 자리로 되돌아온다.
          go.replace("/login?e=session");
        }}
      />
    </DetailShell>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.group}>
      <Text style={s.groupTitle}>{title}</Text>
      <Card style={s.groupCard}>{children}</Card>
    </View>
  );
}

function NavRow({
  label,
  value,
  badge,
  onPress,
}: {
  label: string;
  value?: string;
  badge?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={s.navRow} onPress={onPress} disabled={!onPress}>
      <Text style={s.navLabel}>{label}</Text>
      {badge && (
        <View style={s.navBadge}>
          <Text style={s.navBadgeText}>{badge}</Text>
        </View>
      )}
      {value && <Text style={s.navValue}>{value}</Text>}
      {onPress && <AppIcon name="chevron-right" size={16} color={C.muted} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  profileCard: { flexDirection: "row", alignItems: "center", gap: SP.md, padding: SP.lg },
  avatar: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: FS.body, color: C.brand, fontWeight: FW.semibold },
  profileCopy: { flex: 1, gap: 2 },
  profileName: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  profileSub: { fontSize: FS.sm, color: C.body },

  group: { gap: SP.sm },
  groupTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  groupCard: { padding: 0 },

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    minHeight: 49,
    paddingHorizontal: SP.lg,
  },
  navLabel: { flex: 1, fontSize: FS.body, color: C.ink },
  navValue: { fontSize: FS.cap, color: C.body },
  navBadge: { borderRadius: R.sm, backgroundColor: C.brandSoft, paddingHorizontal: SP.sm, paddingVertical: 3 },
  navBadgeText: { fontSize: FS.xs, fontWeight: FW.semibold, color: C.brand },

  logout: { minHeight: 45, alignItems: "center", justifyContent: "center" },
  logoutText: { fontSize: FS.body, fontWeight: FW.semibold, color: C.danger },
});
