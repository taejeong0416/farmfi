// 03 설비 알림
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { apiFetch } from "@/lib/api";
import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { alertKind, formatStamp, type NotificationsResponse } from "@/farmfi/api";
import { R, SP } from "@/farmfi/theme";
import {
  AlertCard,
  DetailShell,
  EmptyState,
  Pill,
  SkeletonBlock,
  StateNotice,
} from "@/farmfi/ui";

export default function AlertsScreen() {
  const { projectId, project } = useFarmProjects();
  const notif = useApiResource<NotificationsResponse>(
    projectId ? `/api/notifications?projectId=${projectId}` : null,
    "설비 알림을 불러오지 못했습니다."
  );

  // 확인 처리는 서버에 쓴다. 응답을 기다리지 않고 먼저 접되, 실패하면 되돌린다 —
  // 처리된 척 남겨두면 운영자가 조치를 건너뛴다.
  const [acked, setAcked] = useState<string[]>([]);

  const acknowledge = async (id: string) => {
    setAcked((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await apiFetch(`/api/alerts/${id}/acknowledge`, { method: "POST" });
    } catch {
      setAcked((prev) => prev.filter((x) => x !== id));
    }
  };
  const [onlyUnread, setOnlyUnread] = useState(false);

  const all = notif.data?.notifications ?? [];
  const isAcked = (id: string, isRead: boolean) => isRead || acked.includes(id);
  const unread = all.filter((a) => !isAcked(a.id, a.isRead));
  const shown = onlyUnread ? unread : all;

  return (
    <DetailShell title="설비 알림" subtitle={project?.name}>
      <View style={s.filter}>
        <Pill label={`전체 ${all.length}`} active={!onlyUnread} onPress={() => setOnlyUnread(false)} />
        <Pill label={`미확인 ${unread.length}`} active={onlyUnread} onPress={() => setOnlyUnread(true)} />
      </View>

      {notif.loading && (
        <View style={s.list}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={140} radius={R.lg} />
          ))}
        </View>
      )}
      {notif.error && <StateNotice tone="error" message={notif.error} onRetry={notif.reload} />}

      {!notif.loading && !notif.error && shown.length === 0 && (
        <EmptyState
          icon="bell"
          title="확인할 알림이 없어요"
          description="새 설비 알림이 발생하면 여기에 표시됩니다."
        />
      )}

      <View style={s.list}>
        {shown.map((a) => {
          const kind = alertKind(a.type);
          return (
            <AlertCard
              key={a.id}
              severity={kind.severity}
              title={kind.title}
              time={formatStamp(a.createdAt)}
              message={a.message}
              acked={isAcked(a.id, a.isRead)}
              onAck={() => acknowledge(a.id)}
            />
          );
        })}
      </View>
    </DetailShell>
  );
}

const s = StyleSheet.create({
  filter: { flexDirection: "row", gap: SP.sm },
  list: { gap: SP.md },
});
