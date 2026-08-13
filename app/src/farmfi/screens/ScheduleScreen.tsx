// 명세 3.2 재배 일정 관리 — 파종·수확 일정 목록 + 등록 화면 진입.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { C } from "../theme";
import { SCHEDULES, SCHEDULE_STATUS_LABEL, type Schedule, type ScheduleStatus } from "../demoData";
import { CropPixel, TapScale } from "../components";
import { Badge, Card, DetailShell, EmptyState, GhostButton, SegmentedTabs , DemoBadge } from "../ui";

type Filter = "all" | ScheduleStatus;

const STATUS_TONE: Record<ScheduleStatus, { fg: string; bg: string }> = {
  planned: { fg: C.info, bg: C.infoSoft },
  growing: { fg: C.green, bg: C.greenSoft },
  done: { fg: C.muted, bg: "#f1efeb" },
};

export default function ScheduleScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () => (filter === "all" ? SCHEDULES : SCHEDULES.filter((x) => x.status === filter)),
    [filter]
  );

  return (
    <DetailShell title="재배 일정" subtitle={`${SCHEDULES.length}건 등록됨`}>
      <DemoBadge />
      <SegmentedTabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "전체" },
          { key: "growing", label: "재배 중" },
          { key: "planned", label: "예정" },
          { key: "done", label: "완료" },
        ]}
      />

      <GhostButton label="재배 일정 추가" icon="plus" onPress={() => router.push("/farm/schedule-new")} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="ui-calendar" title="해당 상태의 일정이 없어요" caption="재배 일정을 추가해 파종·수확 계획을 관리하세요." />
        </Card>
      ) : (
        <View style={s.list}>
          {rows.map((sc) => (
            <ScheduleCard key={sc.id} item={sc} onPress={() => router.push(`/farm/crop-detail?rack=${sc.rack}`)} />
          ))}
        </View>
      )}
    </DetailShell>
  );
}

function ScheduleCard({ item, onPress }: { item: Schedule; onPress: () => void }) {
  return (
    <TapScale scaleTo={0.99} onPress={onPress} style={s.card}>
      <View style={s.cropIcon}>
        <CropPixel kind={item.kind} size="small" />
      </View>
      <View style={s.copy}>
        <View style={s.headRow}>
          <Text style={s.crop}>{item.crop}</Text>
          <Badge tone={STATUS_TONE[item.status]} label={SCHEDULE_STATUS_LABEL[item.status]} />
        </View>
        <Text style={s.rack}>베드 {item.rack}</Text>
        <View style={s.dates}>
          <View style={s.dateItem}>
            <Text style={s.dateLabel}>파종</Text>
            <Text style={s.dateValue}>{item.sownAt}</Text>
          </View>
          <View style={s.dateArrow} />
          <View style={s.dateItem}>
            <Text style={s.dateLabel}>수확 예정</Text>
            <Text style={[s.dateValue, s.dateValueEm]}>{item.harvestAt}</Text>
          </View>
        </View>
      </View>
      <Text style={s.chevron}>›</Text>
    </TapScale>
  );
}

const s = StyleSheet.create({
  list: { gap: 9 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cropIcon: { width: 34, alignItems: "center" },
  copy: { flex: 1, gap: 5 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  crop: { fontSize: 15, color: C.ink, fontWeight: "700", letterSpacing: -0.4 },
  rack: { fontSize: 11, color: C.muted },
  dates: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 3 },
  dateItem: { gap: 3 },
  dateLabel: { fontSize: 9, color: C.muted },
  dateValue: { fontSize: 12, color: C.ink, fontWeight: "600" },
  dateValueEm: { color: C.green },
  dateArrow: { width: 14, height: 1, backgroundColor: "#cfc8bd" },
  chevron: { fontSize: 26, fontWeight: "300", color: "#9b9a94" },
});
