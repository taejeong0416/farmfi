// 명세 2.2 설비 알림 — GET /api/notifications 실연동 + PATCH 로 확인 처리.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C, SEVERITY } from "../theme";
import { useFarmProjects } from "../branch";
import { useApiResource } from "../useApiResource";
import { apiFetch } from "@/lib/api";
import type { Severity } from "../api";
import { Badge, Card, DetailShell, EmptyState, GhostButton, SegmentedTabs } from "../ui";

type Notification = {
  id: string;
  projectId: string | null;
  type: string;
  message: string;
  evidenceUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

type Filter = "all" | "unack";

// 백엔드 type 문자열 → 화면 심각도. 모르는 타입은 주의로 떨어뜨린다(정상으로
// 낮추면 실제 문제를 놓치게 되므로 보수적으로 잡는다).
function severityOf(type: string): Severity {
  if (/fail|error|critical|anomaly_detected/.test(type)) return "critical";
  if (/review|warn|drift/.test(type)) return "warning";
  return "warning";
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    verification_failed: "검증 실패",
    anomaly_detected: "이상 탐지",
    manual_review: "수동 확인 필요",
  };
  return map[type] ?? type;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}.${dd} ${d.toTimeString().slice(0, 5)}`;
}

export default function AlertsScreen() {
  const { projectId } = useFarmProjects();
  const [filter, setFilter] = useState<Filter>("all");
  // 서버 반영 전 낙관적 표시. 실패하면 되돌린다.
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const res = useApiResource<{ notifications: Notification[] }>(
    projectId ? `/api/notifications?projectId=${projectId}` : "/api/notifications",
    "알림을 불러오지 못했습니다."
  );

  const all = res.data?.notifications ?? [];
  const isAcked = (n: Notification) => acked[n.id] ?? n.isRead;
  const unackCount = all.filter((n) => !isAcked(n)).length;
  const rows = useMemo(
    () => (filter === "unack" ? all.filter((n) => !isAcked(n)) : all),
    [all, filter, acked]
  );

  const ack = async (n: Notification) => {
    if (isAcked(n) || busy) return;
    setBusy(n.id);
    setAcked((p) => ({ ...p, [n.id]: true }));
    try {
      await apiFetch("/api/notifications", { method: "PATCH", body: JSON.stringify({ id: n.id }) });
    } catch {
      setAcked((p) => ({ ...p, [n.id]: false }));   // 실패 시 원복 — 처리된 척하지 않는다
    } finally {
      setBusy(null);
    }
  };

  return (
    <DetailShell title="설비 알림" subtitle={res.loading ? "불러오는 중…" : `미확인 ${unackCount}건`}>
      <SegmentedTabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: `전체 ${all.length}` },
          { key: "unack", label: `미확인 ${unackCount}` },
        ]}
      />

      {res.loading ? (
        <Card>
          <EmptyState icon="ui-bell" title="알림을 불러오는 중…" />
        </Card>
      ) : res.error ? (
        <Card>
          <EmptyState icon="ui-warning" title="알림을 불러오지 못했어요" caption={res.error} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="ui-bell" title="확인할 알림이 없어요" caption="새 알림이 발생하면 여기에 표시됩니다." />
        </Card>
      ) : (
        <View style={s.list}>
          {rows.map((n) => {
            const sev = severityOf(n.type);
            const spec = SEVERITY[sev];
            const done = isAcked(n);
            return (
              <Card key={n.id} style={[s.card, !done && { borderLeftWidth: 3, borderLeftColor: spec.fg }]}>
                <View style={s.head}>
                  <Badge severity={sev} />
                  <Text style={s.target}>{typeLabel(n.type)}</Text>
                  <Text style={s.at}>{when(n.createdAt)}</Text>
                </View>
                <Text style={s.message}>{n.message}</Text>
                {done ? (
                  <View style={s.ackedRow}>
                    <View style={s.ackedDot} />
                    <Text style={s.ackedText}>확인 완료</Text>
                  </View>
                ) : (
                  <View style={s.action}>
                    <GhostButton
                      label={busy === n.id ? "처리 중…" : "확인 처리"}
                      icon="check"
                      onPress={() => ack(n)}
                    />
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </DetailShell>
  );
}

const s = StyleSheet.create({
  list: { gap: 9 },
  card: { gap: 9 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  target: { flex: 1, fontSize: 12, color: C.ink, fontWeight: "600" },
  at: { fontSize: 10, color: C.muted },
  message: { fontSize: 13, lineHeight: 19, color: "#3d403b" },
  action: { marginTop: 2 },
  ackedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ackedDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: C.green },
  ackedText: { fontSize: 11, color: C.green, fontWeight: "600" },
});
