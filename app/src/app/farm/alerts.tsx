// 03 설비 알림
import { useState } from "react";
import { StyleSheet, View } from "react-native";

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

  // 확인 처리는 아직 서버에 쓰는 경로가 없다. 이 화면 안에서만 접어둔다.
  const [acked, setAcked] = useState<string[]>([]);
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
              onAck={() => setAcked((prev) => [...prev, a.id])}
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
