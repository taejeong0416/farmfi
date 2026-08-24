// 16 거래 내역
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { formatMonthDay, formatWon, type SalesResponse } from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  Card,
  DetailShell,
  EmptyState,
  GhostButton,
  Pill,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

const ALL = "전체";
const PERIOD_DAYS = 30;

export default function TransactionsScreen() {
  const go = useGo();
  const { projectId, project } = useFarmProjects();
  const sales = useApiResource<SalesResponse>(
    projectId ? `/api/sales?projectId=${projectId}&days=${PERIOD_DAYS}` : null,
    "거래 내역을 불러오지 못했습니다."
  );

  const [filter, setFilter] = useState(ALL);

  const recent = sales.data?.recent ?? [];
  const products = [ALL, ...Array.from(new Set(recent.map((r) => r.productName)))];
  const shown = filter === ALL ? recent : recent.filter((r) => r.productName === filter);

  // 같은 날 거래를 한 카드로 묶는다.
  const byDay = useMemo(() => {
    const map = new Map<string, typeof shown>();
    shown.forEach((r) => {
      const key = formatMonthDay(r.soldAt);
      map.set(key, [...(map.get(key) ?? []), r]);
    });
    return Array.from(map.entries());
  }, [shown]);

  const totals = shown.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      qty: acc.qty + r.quantity,
      amount: acc.amount + r.amount,
    }),
    { count: 0, qty: 0, amount: 0 }
  );

  return (
    <DetailShell
      requiresProject title="거래 내역" subtitle={project?.name}>
      {sales.loading && <SkeletonBlock height={180} radius={R.lg} />}
      {sales.error && <StateNotice tone="error" message={sales.error} onRetry={sales.reload} />}

      {!sales.loading && !sales.error && recent.length === 0 && (
        <EmptyState
          icon="file"
          title="거래 내역이 없어요"
          description="판매가 기록되면 날짜별로 여기에 쌓입니다."
        />
      )}

      {recent.length > 0 && (
        <>
          <View style={s.filters}>
            {products.map((p) => (
              <Pill key={p} label={p} active={p === filter} onPress={() => setFilter(p)} />
            ))}
          </View>

          <Card style={s.card}>
            <Text style={s.cardTitle}>집계</Text>
            <Row label="거래 건수" value={`${totals.count}건`} />
            <Row label="판매 수량" value={`${totals.qty}개`} />
            <Row label="매출 집계" value={`${formatWon(totals.amount)}원`} strong />
          </Card>

          {byDay.map(([day, rows]) => {
            const dayTotal = rows.reduce((sum, r) => sum + r.amount, 0);
            return (
              <Card key={day} style={s.card}>
                <View style={s.dayHead}>
                  <Text style={s.dayDate}>{day}</Text>
                  <Text style={s.dayTotal}>{formatWon(dayTotal)}원</Text>
                </View>
                {rows.map((r) => (
                  <View style={s.itemRow} key={r.id}>
                    <Text style={s.itemName} numberOfLines={1}>
                      {r.productName}
                    </Text>
                    <Text style={s.itemMeta}>
                      {r.quantity}
                      {r.unit} · {formatWon(r.amount)}원
                    </Text>
                  </View>
                ))}
              </Card>
            );
          })}

          <GhostButton
            label="리포트 내보내기"
            icon="download"
            tone="brand"
            onPress={() => go.push("/farm/sales/export")}
          />
        </>
      )}
    </DetailShell>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, strong && { color: C.brand, fontWeight: FW.semibold }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  card: { gap: SP.sm },
  cardTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SP.sm,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
  },
  rowLabel: { fontSize: FS.cap, color: C.body },
  rowValue: { fontSize: FS.body, color: C.ink },

  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayDate: { fontSize: FS.body, color: C.ink },
  dayTotal: { fontSize: FS.body, fontWeight: FW.bold, color: C.brand },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SP.sm },
  itemName: { flex: 1, fontSize: FS.sm, color: C.ink },
  itemMeta: { fontSize: FS.sm, color: C.body },
});
