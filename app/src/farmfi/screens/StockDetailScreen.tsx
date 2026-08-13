// 명세 5.1 재고 현황 및 조정 — 입출고 이력 + 수동 조정.
// 조정 후 음수면 저장하지 않고, 부족 기준 이하로 떨어지면 부족 알림을 띄운다.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { C } from "../theme";
import { type CropKind } from "../data";
import { STOCK_MIN, STOCK_MOVES, STOCK_ROWS } from "../demoData";
import { CropPixel } from "../components";
import {
  Badge,
  Card,
  CardTitle,
  DetailShell,
  EmptyState,
  Field,
  GhostButton,
  KeyValueRow,
  Popup,
  PrimaryButton,
  ProgressBar,
  TimelineRow,
  DemoBadge,
} from "../ui";

const KINDS: CropKind[] = ["butter", "romaine", "basil", "tomato"];

export default function StockDetailScreen() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const cropKind = (kind && KINDS.includes(kind as CropKind) ? kind : "butter") as CropKind;
  const item = STOCK_ROWS.find((r) => r.kind === cropKind) ?? STOCK_ROWS[0];
  const minQty = STOCK_MIN[cropKind];

  const [qty, setQty] = useState(item.stock);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lowWarning, setLowWarning] = useState(false);
  const [history, setMoves] = useState(() => STOCK_MOVES.filter((m) => m.kind === cropKind));

  const isLow = qty <= minQty;

  const adjust = () => {
    const n = Number(delta);
    if (!delta.trim() || !Number.isFinite(n) || n === 0) {
      setError("조정 수량을 0이 아닌 숫자로 입력해주세요.");
      return;
    }
    if (!reason.trim()) {
      setError("조정 사유를 입력해주세요.");
      return;
    }
    const after = qty + n;
    // 명세 예외: 조정 후 재고가 음수가 되면 저장하지 않는다.
    if (after < 0) {
      setError(`현재 수량 ${qty}팩보다 많이 차감할 수 없습니다.`);
      return;
    }
    setError(null);
    setQty(after);
    setMoves((prev) => [
      {
        id: `SM-${Date.now()}`,
        kind: cropKind,
        at: "방금 전",
        delta: n,
        after,
        reason: reason.trim(),
        actor: "운영자 1",
      },
      ...prev,
    ]);
    setDelta("");
    setReason("");
    if (after <= minQty) setLowWarning(true);
  };

  return (
    <DetailShell
      title={item.name}
      subtitle={`부족 기준 ${minQty}팩`}
      action={isLow ? <Badge severity="warning" label="부족" /> : <Badge severity="normal" label="충분" />}
    >
      <Card>
        <View style={s.head}>
          <CropPixel kind={cropKind} size="large" />
          <View style={s.headCopy}>
            <Text style={s.qty}>
              {qty}
              <Text style={s.qtyUnit}>팩</Text>
            </Text>
            <ProgressBar value={(qty / Math.max(minQty * 2, 1)) * 100} tone={isLow ? C.warn : C.green} />
          </View>
        </View>
        <View style={s.kv}>
          <KeyValueRow label="현재 수량" value={`${qty}팩`} />
          <KeyValueRow label="부족 기준" value={`${minQty}팩`} />
          <KeyValueRow
            label="상태"
            value={isLow ? "부족" : "정상"}
            tone={isLow ? C.warn : C.green}
          />
        </View>
      </Card>

      <Card>
        <CardTitle icon="plus">재고 조정</CardTitle>
        <View style={s.form}>
          <View style={s.quickRow}>
            {[-5, -1, +1, +5].map((n) => (
              <Text key={n} onPress={() => setDelta(String(n))} style={s.quickChip}>
                {n > 0 ? `+${n}` : n}
              </Text>
            ))}
          </View>
          <Field
            label="조정 수량"
            required
            value={delta}
            onChangeText={setDelta}
            keyboardType="numbers-and-punctuation"
            placeholder="입고 +, 출고 -"
            suffix="팩"
          />
          <Field
            label="조정 사유"
            required
            value={reason}
            onChangeText={setReason}
            placeholder="예) 베드 A 수확 입고"
            error={error}
          />
          <PrimaryButton label="조정 저장" onPress={adjust} />
        </View>
      </Card>

      <Card>
        <CardTitle icon="clock">입출고 이력</CardTitle>
        {history.length === 0 ? (
          <EmptyState icon="ui-box" title="이력이 없어요" caption="입고·출고가 발생하면 여기에 기록됩니다." />
        ) : (
          <View style={s.timeline}>
            {history.map((m, i) => (
              <TimelineRow
                key={m.id}
                time={`${m.at} · ${m.actor}`}
                title={`${m.delta > 0 ? "+" : ""}${m.delta}팩 → ${m.after}팩`}
                caption={m.reason}
                tone={m.delta > 0 ? C.green : C.warn}
                last={i === history.length - 1}
              />
            ))}
          </View>
        )}
      </Card>

      <GhostButton label="재고 품목 등록" icon="plus" onPress={() => router.push("/farm/stock-new")} />

      <Popup
        visible={lowWarning}
        severity="warning"
        title="재고가 부족해요"
        message={`${item.name} 현재 ${qty}팩 — 부족 기준 ${minQty}팩 이하입니다.`}
        onConfirm={() => setLowWarning(false)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 13 },
  headCopy: { flex: 1, gap: 9 },
  qty: { fontSize: 30, letterSpacing: -1.4, color: C.green, fontWeight: "700" },
  qtyUnit: { fontSize: 13, fontWeight: "500", color: C.ink },
  kv: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#f0ebe3", paddingTop: 4 },

  form: { marginTop: 12, gap: 11 },
  quickRow: { flexDirection: "row", gap: 6 },
  quickChip: {
    flex: 1,
    height: 36,
    lineHeight: 36,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderRadius: 7,
    backgroundColor: "#fff",
    fontSize: 12,
    color: C.ink,
    fontWeight: "600",
  },

  timeline: { marginTop: 13 },
});
