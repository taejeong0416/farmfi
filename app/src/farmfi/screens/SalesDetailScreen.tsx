// 명세 6.2 거래 내역 — 매출 상세 항목에서 거래 건별 시각/품목/수량/금액을 본다.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { C } from "../theme";
import { type CropKind } from "../data";
import { TRANSACTIONS } from "../demoData";
import { CropPixel } from "../components";
import { Card, CardTitle, DetailShell, EmptyState, GhostButton, KeyValueRow, SegmentedTabs } from "../ui";

type Filter = "all" | CropKind;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export default function SalesDetailScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () => (filter === "all" ? TRANSACTIONS : TRANSACTIONS.filter((t) => t.kind === filter)),
    [filter]
  );

  const total = rows.reduce((sum, t) => sum + t.amount, 0);
  const qty = rows.reduce((sum, t) => sum + t.qty, 0);

  // 날짜별로 묶어 헤더를 넣는다(거래가 많아지면 훑기 어려워서).
  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const t of rows) {
      const day = t.at.split(" ")[0];
      map.set(day, [...(map.get(day) ?? []), t]);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <DetailShell title="거래 내역" subtitle={`${rows.length}건 · ${won(total)}`}>
      <SegmentedTabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "전체" },
          { key: "butter", label: "버터헤드" },
          { key: "romaine", label: "로메인" },
          { key: "basil", label: "바질" },
        ]}
      />

      <Card>
        <CardTitle icon="report">집계</CardTitle>
        <View style={s.kv}>
          <KeyValueRow label="거래 건수" value={`${rows.length}건`} />
          <KeyValueRow label="판매 수량" value={`${qty}개`} />
          <KeyValueRow label="매출 합계" value={won(total)} tone={C.green} />
        </View>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="ui-box" title="해당 품목의 거래가 없어요" caption="다른 품목이나 기간을 선택해보세요." />
        </Card>
      ) : (
        grouped.map(([day, items]) => (
          <Card key={day} padded={false}>
            <View style={s.dayHead}>
              <Text style={s.dayText}>{day}</Text>
              <Text style={s.daySum}>{won(items.reduce((sm, t) => sm + t.amount, 0))}</Text>
            </View>
            {items.map((t, i) => (
              <View key={t.id} style={[s.txRow, i === items.length - 1 && s.txRowLast]}>
                <CropPixel kind={t.kind} size="small" />
                <View style={s.txCopy}>
                  <Text style={s.txItem}>{t.item}</Text>
                  <Text style={s.txMeta}>
                    {t.at.split(" ")[1]} · {t.id}
                  </Text>
                </View>
                <Text style={s.txQty}>{t.qty}개</Text>
                <Text style={s.txAmount}>{won(t.amount)}</Text>
              </View>
            ))}
          </Card>
        ))
      )}

      <GhostButton label="리포트 내보내기" icon="report" onPress={() => router.push("/farm/report-export")} />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  kv: { marginTop: 6 },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f0ebe3",
    backgroundColor: "#faf8f4",
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  dayText: { fontSize: 12, color: C.ink, fontWeight: "700" },
  daySum: { fontSize: 12, color: C.green, fontWeight: "700" },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#f3efe9",
    paddingHorizontal: 13,
  },
  txRowLast: { borderBottomWidth: 0 },
  txCopy: { flex: 1, gap: 3 },
  txItem: { fontSize: 13, color: C.ink, fontWeight: "600" },
  txMeta: { fontSize: 10, color: C.muted },
  txQty: { width: 40, fontSize: 12, color: C.ink, textAlign: "right" },
  txAmount: { width: 76, fontSize: 12, color: C.ink, textAlign: "right", fontWeight: "600" },
});
