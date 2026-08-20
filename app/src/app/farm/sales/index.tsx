// 15 판매 데이터 리포트 (+ 로딩, + 25 매출 데이터 없음)
import { StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  cropKindOf,
  formatMonthDay,
  formatWon,
  ratioPercent,
  type SalesResponse,
  type SalesTrendResponse,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  AppShell,
  BarChart,
  Card,
  CardTitle,
  EmptyState,
  GhostButton,
  HistoryRow,
  RankRow,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

const PERIOD_DAYS = 30;

export default function SalesScreen() {
  const go = useGo();
  const { project, projectId } = useFarmProjects();

  const sales = useApiResource<SalesResponse>(
    projectId ? `/api/sales?projectId=${projectId}&days=${PERIOD_DAYS}` : null,
    "판매 데이터를 불러오지 못했습니다."
  );
  const trend = useApiResource<SalesTrendResponse>(
    projectId ? `/api/sales/trend?projectId=${projectId}&days=${PERIOD_DAYS}` : null,
    "품목별 판매를 불러오지 못했습니다."
  );

  const daily = sales.data?.daily ?? [];
  const summary = sales.data?.summary;
  const recent = sales.data?.recent ?? [];
  const byProduct = trend.data?.byProduct ?? [];
  const topQty = Math.max(...byProduct.map((p) => p.totalQuantity), 1);

  // 막대 아래 눈금은 다섯 칸만 찍는다 — 30개를 다 적으면 겹친다.
  const labels =
    daily.length > 0
      ? [0, 0.25, 0.5, 0.75, 1]
          .map((r) => daily[Math.min(daily.length - 1, Math.floor(r * (daily.length - 1)))])
          .map((d) => formatMonthDay(d.date))
      : [];

  const empty = !sales.loading && !sales.error && (summary?.orderCount ?? 0) === 0;

  return (
    <AppShell active="sales" storeName={project?.name} onStorePress={() => go.push("/store-select")}>
      {sales.error && <StateNotice tone="error" message={sales.error} onRetry={sales.reload} />}

      {sales.loading && (
        <>
          <SkeletonBlock height={115} radius={R.lg} />
          <SkeletonBlock height={251} radius={R.lg} />
          <SkeletonBlock height={171} radius={R.lg} />
        </>
      )}

      {empty && (
        <EmptyState
          icon="bars"
          title="매출 데이터가 없어요"
          description="판매가 기록되면 기간별 집계와 품목 순위가 여기에 나타납니다."
          action="거래 내역 보기"
          onAction={() => go.push("/farm/sales/transactions")}
        />
      )}

      {!sales.loading && !sales.error && !empty && (
        <>
          {/* 기간 집계 */}
          <Card style={s.card}>
            <CardTitle>최근 {PERIOD_DAYS}일 집계</CardTitle>
            <View style={s.summaryRow}>
              <Summary label="매출(원)" value={formatWon(summary?.totalAmount ?? 0)} />
              <Summary label="판매량" value={String(summary?.totalQuantity ?? 0)} unit="봉" />
              <Summary label="주문수" value={String(summary?.orderCount ?? 0)} unit="건" />
            </View>
            {sales.data?.stale && sales.data.dataAsOf && (
              <Text style={s.stale}>데이터 기준일 {formatMonthDay(sales.data.dataAsOf)}</Text>
            )}
          </Card>

          {/* 일별 매출 */}
          <Card style={s.card}>
            <CardTitle>일별 매출</CardTitle>
            <BarChart values={daily.map((d) => d.amount)} labels={labels} />
          </Card>

          {/* 품목별 판매량 */}
          <Card style={s.card}>
            <CardTitle>품목별 판매량</CardTitle>
            {trend.error && <StateNotice tone="error" message={trend.error} onRetry={trend.reload} />}
            {byProduct.slice(0, 5).map((p) => (
              <RankRow
                key={p.productId}
                name={p.productName}
                cropKind={cropKindOf(p.productName)}
                percent={ratioPercent(p.totalQuantity, topQty)}
                value={`${p.totalQuantity}봉`}
              />
            ))}
          </Card>

          {/* 최근 거래 */}
          <Card style={s.card}>
            <CardTitle>최근 거래</CardTitle>
            {recent.slice(0, 5).map((r) => (
              <HistoryRow
                key={r.id}
                date={formatMonthDay(r.soldAt)}
                name={r.productName}
                qty={`${r.quantity}${r.unit}`}
                amount={`${formatWon(r.amount)}원`}
              />
            ))}
          </Card>

          <View style={s.actions}>
            <GhostButton
              label="거래 내역"
              icon="file"
              tone="brand"
              onPress={() => go.push("/farm/sales/transactions")}
            />
            <GhostButton
              label="리포트 내보내기"
              icon="download"
              tone="brand"
              onPress={() => go.push("/farm/sales/export")}
            />
          </View>
        </>
      )}
    </AppShell>
  );
}

function Summary({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={s.summaryItem}>
      <Text style={s.summaryLabel}>{label}</Text>
      <View style={s.summaryValueRow}>
        <Text style={s.summaryValue} numberOfLines={1}>
          {value}
        </Text>
        {unit && <Text style={s.summaryUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.md },
  summaryRow: { flexDirection: "row", gap: SP.sm },
  summaryItem: { flex: 1, gap: SP.xs },
  summaryLabel: { fontSize: FS.sm, color: C.body },
  summaryValueRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  summaryValue: { fontSize: FS.h2, fontWeight: FW.bold, color: C.ink },
  summaryUnit: { fontSize: FS.sm, color: C.body },
  stale: { fontSize: FS.xs, color: C.muted },
  actions: { gap: SP.sm },
});
