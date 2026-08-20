// 19 알림 설정
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { Card, DetailShell, Popup, PrimaryButton, Toggle, useGo } from "@/farmfi/ui";

const CHANNELS = [
  { key: "push", label: "앱 푸시", hint: "앱 푸시만 받습니다. 기기 알림 권한이 필요해요." },
  { key: "sms", label: "문자", hint: "등록된 번호로 문자를 받습니다." },
  { key: "both", label: "둘 다", hint: "앱 푸시와 문자를 모두 받습니다." },
];

const TYPES = [
  {
    key: "critical",
    label: "설비 위험 알림",
    hint: "임계값 초과·설비 정지 등 즉시 조치가 필요한 알림",
    on: true,
  },
  {
    key: "warning",
    label: "설비 주의 알림",
    hint: "임계값 근접·스케줄 지연 등 확인이 필요한 알림",
    on: true,
  },
  {
    key: "stock",
    label: "재고 부족 알림",
    hint: "품목 수량이 부족 기준 이하로 내려갈 때",
    on: true,
  },
  {
    key: "harvest",
    label: "수확 예정 알림",
    hint: "재배 일정의 수확 예정일 3일 전",
    on: false,
  },
  {
    key: "weekly",
    label: "주간 리포트",
    hint: "매주 월요일 지난주 매출·판매 요약",
    on: false,
  },
];

export default function NotificationSettingsScreen() {
  const go = useGo();
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(TYPES.map((t) => [t.key, t.on]))
  );
  const [saved, setSaved] = useState(false);

  return (
    <DetailShell
      title="알림 설정"
      footer={<PrimaryButton label="설정 저장" onPress={() => setSaved(true)} />}
    >
      <Card style={s.card}>
        <Text style={s.groupTitle}>수신 채널</Text>
        <View style={s.channelRow}>
          {CHANNELS.map((c) => {
            const active = c.key === channel.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setChannel(c)}
                style={[s.channel, active && { backgroundColor: C.brand, borderColor: C.brand }]}
              >
                <Text style={[s.channelText, active && { color: C.paper }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.hint}>{channel.hint}</Text>
      </Card>

      <Card style={s.card}>
        <Text style={s.groupTitle}>알림 유형</Text>
        {TYPES.map((t) => (
          <View style={s.typeRow} key={t.key}>
            <View style={s.typeCopy}>
              <Text style={s.typeLabel}>{t.label}</Text>
              <Text style={s.typeHint}>{t.hint}</Text>
            </View>
            <Toggle
              on={on[t.key]}
              onChange={(next) => setOn((prev) => ({ ...prev, [t.key]: next }))}
            />
          </View>
        ))}
      </Card>

      <Popup
        visible={saved}
        title="알림 설정을 적용했습니다"
        message="이 기기에만 적용됩니다. 서버 반영은 알림 설정 API 연결 후 이뤄집니다."
        onConfirm={() => {
          setSaved(false);
          go.back();
        }}
        onCancel={() => setSaved(false)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.md },
  groupTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  channelRow: { flexDirection: "row", gap: SP.sm },
  channel: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
  },
  channelText: { fontSize: FS.cap, fontWeight: FW.semibold, color: C.body },
  hint: { fontSize: FS.xs, color: C.body },

  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    paddingVertical: SP.sm,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
  },
  typeCopy: { flex: 1, gap: 2 },
  typeLabel: { fontSize: FS.body, color: C.ink },
  typeHint: { fontSize: FS.xs, color: C.body },
});
