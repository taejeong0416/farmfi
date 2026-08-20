// 02 대시보드 (+ 로딩)
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  alertKind,
  formatStamp,
  rackIdAt,
  stageLabel,
  type InventoryResponse,
  type MonitoringSummaryResponse,
  type NotificationsResponse,
  type TodayTasksResponse,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import {
  AlertCard,
  AppShell,
  Card,
  Checkbox,
  EmptyState,
  MetricTile,
  SectionTitle,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";
import { useState } from "react";

export default function DashboardScreen() {
  const go = useGo();
  const { user } = useAuth();
  const { project, projectId, loading: branchLoading, error: branchError } = useFarmProjects();

  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "재고 현황을 불러오지 못했습니다."
  );
  const mon = useApiResource<MonitoringSummaryResponse>(
    projectId ? `/api/monitoring/${projectId}` : null,
    "센서 요약을 불러오지 못했습니다."
  );
  const notif = useApiResource<NotificationsResponse>(
    projectId ? `/api/notifications?projectId=${projectId}` : null,
    "설비 알림을 불러오지 못했습니다."
  );
  const tasks = useApiResource<TodayTasksResponse>(
    projectId ? `/api/tasks/today?projectId=${projectId}` : null,
    "오늘 할 일을 불러오지 못했습니다."
  );

  // 확인 처리는 아직 서버에 쓰는 경로가 없다. 이 화면 안에서만 접어둔다.
  const [acked, setAcked] = useState<string[]>([]);
  const [doneTasks, setDoneTasks] = useState<string[]>([]);

  const summary = inv.data?.projects[0]?.summary;
  const beds = inv.data?.projects[0]?.items ?? [];
  const alerts = notif.data?.notifications ?? [];

  const loading = branchLoading || inv.loading || mon.loading;

  return (
    <AppShell active="dashboard" storeName={project?.name} onStorePress={() => go.push("/store-select")}>
      {/* 운영자 프로필 */}
      <View style={s.profile}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(user?.name ?? "운").slice(0, 1)}</Text>
        </View>
        <View style={s.profileCol}>
          <Text style={s.profileName}>{user ? `${user.name} 운영자` : "운영자"}</Text>
          <Text style={s.profileSub}>오늘도 좋은 하루입니다</Text>
        </View>
      </View>

      {branchError && <StateNotice tone="error" message={branchError} />}

      {/* 핵심 지표 4 */}
      <View style={s.kpiGrid}>
        {loading ? (
          [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={71} radius={R.lg} style={s.kpiSkeleton} />)
        ) : (
          <>
            <MetricTile
              label="센서 가동률"
              value={mon.data ? String(Math.round(mon.data.summary.uptimeRate)) : "—"}
              unit="%"
            />
            <MetricTile
              label="이상 감지"
              value={mon.data ? String(mon.data.summary.anomalyCount) : "—"}
              unit="건"
            />
            <MetricTile
              label="수확 가능"
              value={summary ? String(summary.harvestReadyTotal) : "—"}
              unit="봉"
            />
            <MetricTile label="재배 베드" value={summary ? String(summary.bedCount) : "—"} unit="개" />
          </>
        )}
      </View>

      {/* 설비 알림 */}
      <View style={s.section}>
        <SectionTitle action="전체 보기" onAction={() => go.push("/farm/alerts")}>
          설비 알림
        </SectionTitle>
        {notif.loading && <SkeletonBlock height={81} radius={R.lg} />}
        {notif.error && <StateNotice tone="error" message={notif.error} onRetry={notif.reload} />}
        {!notif.loading && !notif.error && alerts.length === 0 && (
          <Card>
            <Text style={s.quiet}>확인할 알림이 없습니다.</Text>
          </Card>
        )}
        {alerts.slice(0, 2).map((a) => {
          const kind = alertKind(a.type);
          return (
            <AlertCard
              key={a.id}
              severity={kind.severity}
              title={kind.title}
              time={formatStamp(a.createdAt)}
              message={a.message}
              acked={a.isRead || acked.includes(a.id)}
              onAck={() => setAcked((prev) => [...prev, a.id])}
            />
          );
        })}
      </View>

      {/* 개점 여정 — 마일스톤 증빙(M-13)으로 들어가는 자리.
          명세 0.2: 픽업 예정·증빙 제출·설비 연결은 대시보드의 "오늘 할 일"과
          매장 메뉴에서 들어간다. */}
      <View style={s.section}>
        <SectionTitle action="단계 보기" onAction={() => go.push("/farm/evidence")}>
          매장 개점 여정
        </SectionTitle>
        <Card>
          <Pressable style={s.journeyRow} onPress={() => go.push("/farm/evidence")}>
            <View style={s.journeyIcon}>
              <AppIcon name="leaf" size={18} color={C.brand} />
            </View>
            <View style={s.journeyCol}>
              <Text style={s.journeyTitle}>증빙 제출 · 단계 확인</Text>
              <Text style={s.journeySub}>
                증빙이 승인되면 그 단계 자금이 집행돼요
              </Text>
            </View>
            <AppIcon name="chevron-right" size={18} color={C.muted} />
          </Pressable>
        </Card>
      </View>

      {/* 오늘 할 일 */}
      <View style={s.section}>
        <SectionTitle>오늘 할 일</SectionTitle>
        {tasks.loading && <SkeletonBlock height={54} radius={R.md} />}
        {tasks.error && <StateNotice tone="error" message={tasks.error} onRetry={tasks.reload} />}
        {!tasks.loading && !tasks.error && (tasks.data?.tasks.length ?? 0) === 0 && (
          <Card>
            <Text style={s.quiet}>오늘 처리할 항목이 없습니다.</Text>
          </Card>
        )}
        {tasks.data?.tasks.map((t) => {
          const key = `${t.type}:${t.productId}`;
          const done = doneTasks.includes(key);
          return (
            <Card key={key} style={s.taskRow}>
              <Checkbox
                checked={done}
                onChange={() =>
                  setDoneTasks((prev) => (done ? prev.filter((k) => k !== key) : [...prev, key]))
                }
              />
              <Text style={[s.taskText, done && s.taskTextDone]} numberOfLines={2}>
                {t.message}
              </Text>
              <View style={s.taskAction}>
                <Text style={s.taskActionText}>{t.type === "harvest" ? "수확" : "보충"}</Text>
              </View>
            </Card>
          );
        })}
      </View>

      {/* 매장 현황 — 베드 배치 */}
      <View style={s.section}>
        <SectionTitle action="자세히" onAction={() => go.replace("/farm/growth")}>
          매장 현황
        </SectionTitle>
        <Card style={s.floorCard}>
          {inv.loading && <SkeletonBlock height={120} radius={R.md} />}
          {inv.error && <StateNotice tone="error" message={inv.error} onRetry={inv.reload} />}
          {!inv.loading && !inv.error && beds.length === 0 && (
            <EmptyState
              icon="sprout"
              title="재배 중인 작물이 없어요"
              description="베드에 작물이 심어지면 여기에 배치가 나타납니다."
            />
          )}
          <View style={s.floorGrid}>
            {beds.slice(0, 4).map((item, i) => (
              <View style={s.bedPill} key={item.productId}>
                <AppIcon name="leaf" size={14} color={C.brand} />
                <View style={s.bedPillCol}>
                  <Text style={s.bedPillName}>베드 {rackIdAt(i)}</Text>
                  <Text style={s.bedPillSub}>
                    {item.productName} · {stageLabel(item.maturityPercent)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  journeyRow: { flexDirection: "row", alignItems: "center", gap: SP.md },
  journeyIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: C.brandSoft,
    alignItems: "center", justifyContent: "center",
  },
  journeyCol: { flex: 1, gap: 2 },
  journeyTitle: { fontSize: FS.md, fontWeight: FW.semibold, color: C.ink },
  journeySub: { fontSize: FS.sm, color: C.muted },
  profile: { flexDirection: "row", alignItems: "center", gap: SP.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: FS.body, color: C.brand, fontWeight: FW.semibold },
  profileCol: { flex: 1, gap: 2 },
  profileName: { fontSize: FS.xl, fontWeight: FW.semibold, color: C.ink },
  profileSub: { fontSize: FS.cap, color: C.body },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP.md },
  kpiSkeleton: { flexBasis: "47%", flexGrow: 1 },

  section: { gap: SP.md },
  quiet: { fontSize: FS.cap, color: C.body, textAlign: "center", paddingVertical: SP.sm },

  taskRow: { flexDirection: "row", alignItems: "center", gap: SP.md, borderRadius: R.md },
  taskText: { flex: 1, fontSize: FS.md, color: C.ink },
  taskTextDone: { color: C.muted, textDecorationLine: "line-through" },
  taskAction: { paddingHorizontal: SP.md, paddingVertical: SP.xs, borderRadius: R.sm, backgroundColor: C.brandSoft },
  taskActionText: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.brand },

  floorCard: { gap: SP.md },
  floorGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  bedPill: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
    padding: SP.sm,
  },
  bedPillCol: { flex: 1 },
  bedPillName: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.ink },
  bedPillSub: { fontSize: FS.xs, color: C.body },
});
