// 명세 7.1 알림 설정 — 유형별 수신 여부 + 수신 채널.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C } from "../theme";
import { NOTIFY_PREFS } from "../demoData";
import { Card, CardTitle, DetailShell, PixelIcon, Popup, PrimaryButton, SegmentedTabs, Toggle , DemoBadge } from "../ui";

type Channel = "push" | "sms" | "both";

const CHANNEL_LABEL: Record<Channel, string> = { push: "앱 푸시", sms: "문자", both: "둘 다" };

export default function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState(() => Object.fromEntries(NOTIFY_PREFS.map((p) => [p.key, p.on])));
  const [channel, setChannel] = useState<Channel>("push");
  const [saved, setSaved] = useState(false);

  const onCount = Object.values(prefs).filter(Boolean).length;

  return (
    <DetailShell title="알림 설정" subtitle={`${onCount}개 유형 수신 중`}>
      <DemoBadge />
      <Card>
        <CardTitle icon="monitor">수신 채널</CardTitle>
        <View style={s.block}>
          <SegmentedTabs<Channel>
            value={channel}
            onChange={setChannel}
            options={(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => ({ key: c, label: CHANNEL_LABEL[c] }))}
          />
          <Text style={s.hint}>
            {channel === "sms"
              ? "문자만 받으면 앱을 열지 않아도 알림을 확인할 수 있어요."
              : channel === "both"
                ? "중요 알림을 놓치지 않지만 문자 요금이 발생할 수 있어요."
                : "앱 푸시만 받습니다. 기기 알림 권한이 필요해요."}
          </Text>
        </View>
      </Card>

      <Card padded={false}>
        <View style={s.listPad}>
          <View style={s.listHead}>
            <PixelIcon name="ui-bell" size={22} />
            <Text style={s.listHeadText}>알림 유형</Text>
          </View>
          {NOTIFY_PREFS.map((p, i) => (
            <View key={p.key} style={[s.row, i === NOTIFY_PREFS.length - 1 && s.rowLast]}>
              <View style={s.rowCopy}>
                <Text style={s.rowLabel}>{p.label}</Text>
                <Text style={s.rowCaption}>{p.caption}</Text>
              </View>
              <Toggle
                on={!!prefs[p.key]}
                onChange={(next) => setPrefs((prev) => ({ ...prev, [p.key]: next }))}
              />
            </View>
          ))}
        </View>
      </Card>

      <PrimaryButton label="알림 설정 저장" onPress={() => setSaved(true)} />

      <Popup
        visible={saved}
        title="알림 설정을 저장했어요"
        message={`${CHANNEL_LABEL[channel]}로 ${onCount}개 유형을 받습니다.`}
        onConfirm={() => setSaved(false)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  block: { marginTop: 12, gap: 9 },
  hint: { fontSize: 11, lineHeight: 16, color: C.muted },

  listPad: { paddingHorizontal: 13 },
  listHead: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 13, paddingBottom: 4 },
  listHeadText: { fontSize: 16, letterSpacing: -0.4, color: C.ink, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 66,
    borderBottomWidth: 1,
    borderBottomColor: "#f0ebe3",
    paddingVertical: 11,
  },
  rowLast: { borderBottomWidth: 0 },
  rowCopy: { flex: 1, gap: 4 },
  rowLabel: { fontSize: 13, color: C.ink, fontWeight: "600" },
  rowCaption: { fontSize: 11, color: C.muted, lineHeight: 16 },
});
