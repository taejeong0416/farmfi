// 05 생육 상세
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  formatStamp,
  rackIdAt,
  stageLabel,
  type InventoryResponse,
  type MonitoringDetailResponse,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  Card,
  CardTitle,
  DetailShell,
  Field,
  Popup,
  PrimaryButton,
  ProgressBar,
  SkeletonBlock,
  StateNotice,
} from "@/farmfi/ui";

const STAGES = ["파종기", "생장기", "성장기", "수확기"];

type Observation = { at: string; stage: string; note: string };

export default function GrowthDetailScreen() {
  const { item: itemId } = useLocalSearchParams<{ item: string }>();
  const { projectId } = useFarmProjects();

  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "작물 정보를 불러오지 못했습니다."
  );
  const mon = useApiResource<MonitoringDetailResponse>(
    projectId ? `/api/monitoring/${projectId}?days=1` : null,
    "센서 값을 불러오지 못했습니다."
  );

  const items = inv.data?.projects[0]?.items ?? [];
  const index = items.findIndex((i) => i.productId === itemId);
  const item = index >= 0 ? items[index] : null;
  const latest = mon.data?.points.at(-1) ?? null;

  const [stage, setStage] = useState(STAGES[STAGES.length - 1]);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  // 관찰 기록을 쓰는 API가 아직 없다. 이 화면에 머무는 동안만 목록에 쌓인다.
  const [log, setLog] = useState<Observation[]>([]);

  const save = () => {
    if (!note.trim()) return;
    setLog((prev) => [{ at: new Date().toISOString(), stage, note: note.trim() }, ...prev]);
    setNote("");
    setSaved(true);
  };

  if (inv.loading) {
    return (
      <DetailShell title="생육 상세">
        <SkeletonBlock height={154} radius={R.lg} />
        <SkeletonBlock height={167} radius={R.lg} />
      </DetailShell>
    );
  }

  if (inv.error || !item) {
    return (
      <DetailShell title="생육 상세">
        <StateNotice
          tone="error"
          message={inv.error ?? "해당 작물을 찾을 수 없습니다."}
          onRetry={inv.reload}
        />
      </DetailShell>
    );
  }

  const bedName = `베드 ${rackIdAt(index)}`;
  const current = stageLabel(item.maturityPercent);

  return (
    <DetailShell title={item.productName} subtitle={`${bedName} · ${current}`}>
      {/* 생육 단계 */}
      <Card style={s.card}>
        <CardTitle>생육 단계</CardTitle>
        <ProgressBar percent={item.maturityPercent} height={10} />
        <View style={s.stageRow}>
          {STAGES.map((st) => (
            <Text key={st} style={[s.stageLabel, st === current && s.stageLabelOn]}>
              {st}
            </Text>
          ))}
        </View>
        <View style={s.maturityRow}>
          <Text style={s.rowLabel}>성숙도</Text>
          <Text style={s.maturityValue}>{Math.round(item.maturityPercent)}%</Text>
        </View>
      </Card>

      {/* 현재 상태 */}
      <Card style={s.card}>
        <CardTitle>현재 상태</CardTitle>
        <Row label="생육 상태" value={mon.data ? (mon.data.summary.latestHealthy ? "정상" : "확인 필요") : "—"} />
        <Row label="습도" value={latest ? `${latest.humidity.toFixed(0)}%` : "—"} />
        <Row label="배정 베드" value={bedName} />
        <Row label="재배 중" value={`${item.growing}${item.unit}`} />
        <Row
          label="예상 수확"
          value={item.expectedHarvestAt ? formatStamp(item.expectedHarvestAt) : "미정"}
        />
      </Card>

      {/* 관찰 기록 */}
      <Card style={s.card}>
        <CardTitle>관찰 기록</CardTitle>
        <View style={s.stagePills}>
          {STAGES.map((st) => {
            const on = st === stage;
            return (
              <Pressable
                key={st}
                onPress={() => setStage(st)}
                style={[s.stagePill, on && { backgroundColor: C.brandSoft, borderColor: C.brand }]}
              >
                <Text style={[s.stagePillText, on && { color: C.brand, fontWeight: FW.bold }]}>{st}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field
          label="관찰 내용"
          required
          placeholder="예) 잎 색 균일, 수확 적기 도달"
          value={note}
          onChangeText={setNote}
          multiline
        />
        <PrimaryButton label="기록 저장" onPress={save} disabled={!note.trim()} />
      </Card>

      {/* 관찰 이력 */}
      {log.length > 0 && (
        <Card style={s.card}>
          <CardTitle>관찰 이력</CardTitle>
          {log.map((o) => (
            <View style={s.logRow} key={o.at}>
              <Text style={s.logAt}>{formatStamp(o.at)}</Text>
              <Text style={s.logStage}>{o.stage}</Text>
              <Text style={s.logNote}>{o.note}</Text>
            </View>
          ))}
        </Card>
      )}

      <Popup
        visible={saved}
        title="기록을 남겼습니다"
        message="이 기기에만 남습니다. 서버 저장은 관찰 기록 API 연결 후 반영됩니다."
        onConfirm={() => setSaved(false)}
        onCancel={() => setSaved(false)}
      />
    </DetailShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.md },
  stageRow: { flexDirection: "row", justifyContent: "space-between" },
  stageLabel: { fontSize: FS.sm, color: C.muted },
  stageLabelOn: { color: C.brand, fontWeight: FW.semibold },
  maturityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  maturityValue: { fontSize: FS.h2, fontWeight: FW.bold, color: C.brand },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SP.sm,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
  },
  rowLabel: { fontSize: FS.cap, color: C.body },
  rowValue: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },

  stagePills: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  stagePill: {
    paddingHorizontal: SP.md,
    height: 29,
    justifyContent: "center",
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
  },
  stagePillText: { fontSize: FS.xs, color: C.body },

  logRow: { gap: 2, paddingTop: SP.md, borderTopWidth: 1, borderTopColor: C.lineSoft },
  logAt: { fontSize: FS.xs, color: C.muted },
  logStage: { fontSize: FS.cap, fontWeight: FW.semibold, color: C.brand },
  logNote: { fontSize: FS.cap, color: C.ink },
});
