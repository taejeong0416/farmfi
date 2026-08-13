// 명세 2.2 설비 알림 확인 — 알림 목록 조회 + 확인 처리.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C, SEVERITY } from "../theme";
import { ALERTS, type Alert } from "../demoData";
import { Badge, Card, DetailShell, EmptyState, GhostButton, SegmentedTabs , DemoBadge } from "../ui";

type Filter = "all" | "unack";

export default function AlertsScreen() {
  // 확인 처리는 서버 왕복 전 낙관적 반영. ack 된 항목은 다시 눌러도 상태를 바꾸지 않는다(명세 예외).
  const [acked, setAcked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALERTS.map((a) => [a.id, a.ack]))
  );
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () => (filter === "unack" ? ALERTS.filter((a) => !acked[a.id]) : ALERTS),
    [filter, acked]
  );
  const unackCount = ALERTS.filter((a) => !acked[a.id]).length;

  const ack = (id: string) => {
    setAcked((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  return (
    <DetailShell title="설비 알림" subtitle={`미확인 ${unackCount}건`}>
      <DemoBadge />
      <SegmentedTabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: `전체 ${ALERTS.length}` },
          { key: "unack", label: `미확인 ${unackCount}` },
        ]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="ui-bell" title="확인할 알림이 없어요" caption="새 설비 알림이 발생하면 여기에 표시됩니다." />
        </Card>
      ) : (
        <View style={s.list}>
          {rows.map((a) => (
            <AlertCard key={a.id} alert={a} ack={!!acked[a.id]} onAck={() => ack(a.id)} />
          ))}
        </View>
      )}
    </DetailShell>
  );
}

function AlertCard({ alert, ack, onAck }: { alert: Alert; ack: boolean; onAck: () => void }) {
  const spec = SEVERITY[alert.severity];
  return (
    <Card style={[s.card, !ack && { borderLeftWidth: 3, borderLeftColor: spec.fg }]}>
      <View style={s.head}>
        <Badge severity={alert.severity} />
        <Text style={s.target}>
          베드 {alert.rack} · {alert.device}
        </Text>
        <Text style={s.at}>{alert.at}</Text>
      </View>
      <Text style={s.message}>{alert.message}</Text>
      {ack ? (
        <View style={s.ackedRow}>
          <View style={s.ackedDot} />
          <Text style={s.ackedText}>확인 완료</Text>
        </View>
      ) : (
        <View style={s.action}>
          <GhostButton label="확인 처리" icon="check" onPress={onAck} />
        </View>
      )}
    </Card>
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
