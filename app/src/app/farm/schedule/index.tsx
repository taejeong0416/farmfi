// 06 재배 일정
// 일정 전용 API는 아직 없다. 재고의 파종일·예상 수확일에서 일정을 만들어 보여준다.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { rackIdAt, type InventoryResponse } from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  Calendar,
  Card,
  DetailShell,
  EmptyState,
  GhostButton,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

type Entry = { at: Date; kind: "파종" | "수확"; crop: string; bed: string };

export default function ScheduleScreen() {
  const go = useGo();
  const { projectId, project } = useFarmProjects();
  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "재배 일정을 불러오지 못했습니다."
  );

  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [picked, setPicked] = useState<number | undefined>(today.getDate());

  const entries = useMemo<Entry[]>(() => {
    const items = inv.data?.projects[0]?.items ?? [];
    const list: Entry[] = [];
    items.forEach((item, i) => {
      const bed = `베드 ${rackIdAt(i)}`;
      if (item.plantedAt) {
        list.push({ at: new Date(item.plantedAt), kind: "파종", crop: item.productName, bed });
      }
      if (item.expectedHarvestAt) {
        list.push({ at: new Date(item.expectedHarvestAt), kind: "수확", crop: item.productName, bed });
      }
    });
    return list
      .filter((e) => !Number.isNaN(e.at.getTime()))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [inv.data]);

  const inMonth = entries.filter(
    (e) => e.at.getFullYear() === cursor.year && e.at.getMonth() + 1 === cursor.month
  );
  const marked = inMonth.map((e) => e.at.getDate());

  const shift = (delta: number) => {
    setCursor((c) => {
      const next = new Date(c.year, c.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
    setPicked(undefined);
  };

  const listed = picked ? inMonth.filter((e) => e.at.getDate() === picked) : inMonth;

  return (
    <DetailShell
      requiresProject title="재배 일정" subtitle={project?.name}>
      {inv.loading && <SkeletonBlock height={340} radius={R.lg} />}
      {inv.error && <StateNotice tone="error" message={inv.error} onRetry={inv.reload} />}

      {!inv.loading && !inv.error && (
        <>
          <Card style={s.calendarCard}>
            <Calendar
              year={cursor.year}
              month={cursor.month}
              selected={picked}
              marked={marked}
              onSelect={(d) => setPicked((prev) => (prev === d ? undefined : d))}
              onShift={shift}
            />
            <View style={s.legend}>
              <Legend label="파종" />
              <Legend label="수확" />
              <Text style={s.legendHint}>점이 찍힌 날에 일정이 있습니다</Text>
            </View>
          </Card>

          <View style={s.section}>
            <Text style={s.sectionTitle}>
              {picked ? `${cursor.month}월 ${picked}일 일정` : `${cursor.month}월 전체 일정`}
            </Text>

            {listed.length === 0 && (
              <EmptyState
                icon="calendar"
                title="등록된 일정이 없어요"
                description="파종·수확 일정을 등록하면 달력에 표시됩니다."
              />
            )}

            {listed.map((e) => {
              const past = e.at.getTime() < today.getTime();
              return (
                <Card key={`${e.crop}-${e.kind}-${e.at.toISOString()}`} style={s.entryRow}>
                  <View style={[s.dateChip, past && { backgroundColor: C.surface }]}>
                    <Text style={[s.dateMonth, past && { color: C.body }]}>
                      {String(e.at.getMonth() + 1).padStart(2, "0")}
                    </Text>
                    <Text style={[s.dateDay, past && { color: C.body }]}>
                      {String(e.at.getDate()).padStart(2, "0")}
                    </Text>
                  </View>
                  <View style={s.entryCopy}>
                    <Text style={s.entryTitle}>
                      {e.crop} {e.kind}
                    </Text>
                    <Text style={s.entryBed}>{e.bed}</Text>
                  </View>
                  <Text style={[s.entryState, past && { color: C.body }]}>{past ? "완료" : "예정"}</Text>
                </Card>
              );
            })}
          </View>

          <GhostButton
            label="일정 등록"
            icon="plus"
            tone="brand"
            onPress={() => go.push("/farm/schedule/new")}
          />
        </>
      )}
    </DetailShell>
  );
}

function Legend({ label }: { label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={s.legendDot} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  calendarCard: { gap: SP.md, padding: SP.sm },
  legend: { flexDirection: "row", alignItems: "center", gap: SP.md, paddingHorizontal: SP.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: SP.xs },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand },
  legendText: { fontSize: FS.xs, color: C.body },
  legendHint: { flex: 1, textAlign: "right", fontSize: FS.xs, color: C.muted },

  section: { gap: SP.md },
  sectionTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },

  entryRow: { flexDirection: "row", alignItems: "center", gap: SP.md },
  dateChip: {
    width: 44,
    height: 44,
    borderRadius: R.md,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  dateMonth: { fontSize: 9, color: C.brand },
  dateDay: { fontSize: FS.md, fontWeight: FW.bold, color: C.brand },
  entryCopy: { flex: 1, gap: 2 },
  entryTitle: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },
  entryBed: { fontSize: FS.xs, color: C.body },
  entryState: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.brand },
});
