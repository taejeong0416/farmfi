// 13 재고 상세·조정
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  formatStamp,
  formatWon,
  harvestLabel,
  ratioPercent,
  type InventoryResponse,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  Badge,
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

const RESTOCK_THRESHOLD = 5;
const STEPS = [-5, -1, 1, 5];

type Adjustment = { at: string; delta: number; after: number; reason: string };

export default function InventoryDetailScreen() {
  const { item: itemId } = useLocalSearchParams<{ item: string }>();
  const { projectId } = useFarmProjects();
  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "재고 정보를 불러오지 못했습니다."
  );

  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  // 재고 조정을 쓰는 API가 아직 없다. 조정 이력은 이 화면에 머무는 동안만 쌓인다.
  const [log, setLog] = useState<Adjustment[]>([]);

  const items = inv.data?.projects[0]?.items ?? [];
  const item = items.find((i) => i.productId === itemId) ?? null;

  if (inv.loading) {
    return (
      <DetailShell title="재고 상세">
        <SkeletonBlock height={215} radius={R.lg} />
        <SkeletonBlock height={280} radius={R.lg} />
      </DetailShell>
    );
  }

  if (inv.error || !item) {
    return (
      <DetailShell title="재고 상세">
        <StateNotice
          tone="error"
          message={inv.error ?? "해당 품목을 찾을 수 없습니다."}
          onRetry={inv.reload}
        />
      </DetailShell>
    );
  }

  const num = Number(delta) || 0;
  const applied = log.reduce((sum, a) => sum + a.delta, 0);
  const current = item.inStock + applied;
  const low = current < RESTOCK_THRESHOLD;

  const bump = (step: number) => setDelta(String(num + step));

  const save = () => {
    if (num === 0 || !reason.trim()) return;
    setLog((prev) => [
      { at: new Date().toISOString(), delta: num, after: current + num, reason: reason.trim() },
      ...prev,
    ]);
    setDelta("0");
    setReason("");
    setSaved(true);
  };

  return (
    <DetailShell title={item.productName} subtitle={item.category}>
      {/* 현재 수량 */}
      <Card style={s.card}>
        <View style={s.headRow}>
          <Text style={s.bigQty}>
            {current}
            {item.unit}
          </Text>
          <Badge severity={low ? "critical" : "normal"} label={low ? "부족" : "정상"} />
        </View>
        <ProgressBar percent={ratioPercent(current, Math.max(RESTOCK_THRESHOLD * 4, current))} height={7} />
        <Row label="현재 수량" value={`${current}${item.unit}`} />
        <Row label="부족 기준" value={`${RESTOCK_THRESHOLD}${item.unit}`} />
        <Row label="재배 중" value={`${item.growing}${item.unit}`} />
        <Row label="예상 수확" value={harvestLabel(item.daysToHarvest)} />
        <Row label="단가" value={`${formatWon(item.unitPrice)}원`} />
      </Card>

      {/* 수량 조정 */}
      <Card style={s.card}>
        <CardTitle>수량 조정</CardTitle>
        <View style={s.steps}>
          {STEPS.map((st) => (
            <Pressable key={st} style={s.step} onPress={() => bump(st)}>
              <Text style={s.stepText}>
                {st > 0 ? "+" : ""}
                {st}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field
          label="조정 수량"
          required
          placeholder="입고 +, 출고 -"
          value={delta}
          onChangeText={setDelta}
          keyboardType="numeric"
          suffix={item.unit}
        />
        <Field
          label="조정 사유"
          required
          placeholder="예: 베드 A 수확 입고"
          value={reason}
          onChangeText={setReason}
          multiline
        />
        <PrimaryButton label="조정 저장" onPress={save} disabled={num === 0 || !reason.trim()} />
      </Card>

      {/* 조정 이력 */}
      {log.length > 0 && (
        <Card style={s.card}>
          <CardTitle>조정 이력</CardTitle>
          {log.map((a) => (
            <View style={s.logRow} key={a.at}>
              <View style={[s.logDot, a.delta < 0 && { backgroundColor: C.danger }]} />
              <View style={s.logCopy}>
                <Text style={s.logAt}>{formatStamp(a.at)} · 운영자</Text>
                <Text style={[s.logDelta, a.delta < 0 && { color: C.danger }]}>
                  {a.delta > 0 ? "+" : ""}
                  {a.delta}
                  {item.unit} → {a.after}
                  {item.unit}
                </Text>
                <Text style={s.logReason}>{a.reason}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      <Popup
        visible={saved}
        title="재고를 조정했습니다"
        message="이 기기에만 반영됩니다. 서버 저장은 재고 조정 API 연결 후 이뤄집니다."
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
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bigQty: { fontSize: FS.hero, fontWeight: FW.bold, color: C.brand },

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

  steps: { flexDirection: "row", gap: SP.sm },
  step: {
    flex: 1,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
  },
  stepText: { fontSize: FS.body, color: C.ink },

  logRow: { flexDirection: "row", gap: SP.md, paddingTop: SP.md, borderTopWidth: 1, borderTopColor: C.lineSoft },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: C.brand },
  logCopy: { flex: 1, gap: 2 },
  logAt: { fontSize: FS.xs, color: C.muted },
  logDelta: { fontSize: FS.body, color: C.brand },
  logReason: { fontSize: FS.cap, color: C.ink },
});
