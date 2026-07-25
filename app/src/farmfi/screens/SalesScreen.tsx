import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";

import { C } from "../theme";
import {
  cropKindOf,
  formatMonthDay,
  formatWon,
  ratioPercent,
  type SalesResponse,
  type SalesTrendResponse,
} from "../api";
import { AppShell, BranchSelect, CropPixel, SectionTitle, StateNotice } from "../components";
import { useFarmProjects } from "../branch";
import { useApiResource } from "../useApiResource";

const PERIOD_DAYS = 30;

// 눈금 상한 — 실제 최대 매출을 덮는 가장 가까운 "만원" 단위 값.
function niceMax(values: number[]): number {
  const peak = Math.max(...values, 0);
  if (peak <= 0) return 10000;
  const step = Math.pow(10, Math.floor(Math.log10(peak)) - 1) || 1;
  return Math.ceil(peak / (step * 4)) * step * 4;
}

function SalesLineChart({ daily }: { daily: SalesResponse["daily"] }) {
  const width = 320;
  const height = 126;
  const padX = 40;
  const padY = 12;
  const values = daily.map((d) => d.amount);
  const max = niceMax(values);

  const pts = daily.map((d, i) => {
    const x = padX + (daily.length === 1 ? 0 : (i / (daily.length - 1)) * (width - padX - 8));
    const y = height - padY - (d.amount / max) * (height - padY * 2);
    return { x, y };
  });
  const polyPoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  // X축 라벨 — 실제 판매일에서 5개를 균등 추출.
  const labelCount = Math.min(5, daily.length);
  const xLabels = Array.from({ length: labelCount }, (_, i) => {
    const idx =
      labelCount === 1 ? 0 : Math.round((i / (labelCount - 1)) * (daily.length - 1));
    const d = new Date(daily[idx].date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  return (
    <View style={s.chart}>
      <Svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {gridVals.map((v) => {
          const y = height - padY - (v / max) * (height - padY * 2);
          return (
            <G key={v}>
              <Line x1={padX} x2={width - 8} y1={y} y2={y} stroke="#dadbd7" strokeDasharray="3 3" strokeWidth={1} />
              <SvgText x={2} y={y + 3} fill="#636660" fontSize={8}>
                {v === 0 ? "0" : `${Math.round(v / 10000)}만`}
              </SvgText>
            </G>
          );
        })}
        {pts.length > 1 && (
          <Polyline points={polyPoints} fill="none" stroke={C.green} strokeWidth={2.1} strokeLinejoin="round" />
        )}
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke={C.green} strokeWidth={2} />
        ))}
      </Svg>
      <View style={s.chartLabels}>
        {xLabels.map((l, i) => (
          <Text key={`${l}-${i}`} style={s.chartLabel}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

export default function SalesScreen() {
  const { projectId, loading: projectsLoading, error: projectsError, reload: reloadProjects } =
    useFarmProjects();

  const sales = useApiResource<SalesResponse>(
    projectId ? `/api/sales?projectId=${projectId}&days=${PERIOD_DAYS}&recent=10` : null,
    "판매 데이터를 불러오지 못했습니다."
  );
  const trend = useApiResource<SalesTrendResponse>(
    projectId ? `/api/sales/trend?projectId=${projectId}&days=${PERIOD_DAYS}` : null,
    "품목 추이를 불러오지 못했습니다."
  );

  const body = () => {
    if (projectsError) {
      return <StateNotice tone="error" message={projectsError} onRetry={reloadProjects} />;
    }
    if (projectsLoading || sales.loading) {
      return <StateNotice message="판매 데이터를 불러오는 중…" />;
    }
    if (sales.error) {
      return <StateNotice tone="error" message={sales.error} onRetry={sales.reload} />;
    }
    if (!sales.data) return null;

    const { summary, daily, recent, periodDays } = sales.data;
    const ranking = (trend.data?.byProduct ?? []).slice(0, 4);
    const maxRankQty = ranking.reduce((max, r) => Math.max(max, r.totalQuantity), 0);

    return (
      <>
        <View style={[s.card, s.summary]}>
          <SectionTitle>최근 {periodDays}일 판매 요약</SectionTitle>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>매출(원)</Text>
              <Text style={s.summaryValue}>{formatWon(summary.totalAmount)}</Text>
            </View>
            <View style={[s.summaryItem, s.summaryMid]}>
              <Text style={s.summaryLabel}>판매량</Text>
              <Text style={s.summaryValue}>
                {formatWon(summary.totalQuantity)}<Text style={s.summaryUnit}>봉</Text>
              </Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>주문수</Text>
              <Text style={s.summaryValue}>
                {formatWon(summary.orderCount)}<Text style={s.summaryUnit}>건</Text>
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.card, s.chartCard]}>
          <SectionTitle>일별 매출</SectionTitle>
          {daily.length === 0 ? (
            <StateNotice message={`최근 ${periodDays}일간 판매 기록이 없습니다.`} />
          ) : (
            <SalesLineChart daily={daily} />
          )}
        </View>

        <View style={[s.card, s.rankingCard]}>
          <SectionTitle>인기 품목 TOP 4</SectionTitle>
          {trend.loading && <StateNotice message="품목 추이를 불러오는 중…" />}
          {!trend.loading && trend.error && (
            <StateNotice tone="error" message={trend.error} onRetry={trend.reload} />
          )}
          {!trend.loading && !trend.error && ranking.length === 0 && (
            <StateNotice message="집계할 판매 기록이 없습니다." />
          )}
          {ranking.length > 0 && (
            <View style={s.rankingRows}>
              {ranking.map((item) => (
                <View style={s.rankingRow} key={item.productId}>
                  <CropPixel kind={cropKindOf(item.productName)} size="small" />
                  <Text style={s.rankingName}>{item.productName}</Text>
                  <View style={s.bar}>
                    <View
                      style={[s.barFill, { width: `${ratioPercent(item.totalQuantity, maxRankQty)}%` }]}
                    />
                  </View>
                  <Text style={s.rankingCount}>{item.totalQuantity}봉</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[s.card, s.historyCard]}>
          <SectionTitle>최근 판매 내역</SectionTitle>
          {recent.length === 0 ? (
            <StateNotice message="판매 내역이 없습니다." />
          ) : (
            <View style={s.historyList}>
              {recent.map((row, i) => (
                <View style={[s.historyRow, i < recent.length - 1 && s.historyRowBorder]} key={row.id}>
                  <Text style={s.historyDate}>{formatMonthDay(row.soldAt)}</Text>
                  <Text style={s.historyName} numberOfLines={1}>{row.productName}</Text>
                  <Text style={s.historyQty}>{row.quantity}{row.unit}</Text>
                  <Text style={s.historyPrice}>{formatWon(row.amount)}원</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </>
    );
  };

  return (
    <AppShell active="sales">
      <BranchSelect calendar />
      <Text style={s.pageTitle}>판매 데이터 리포트</Text>
      {body()}
    </AppShell>
  );
}

const s = StyleSheet.create({
  pageTitle: { marginTop: 16, marginBottom: 11, fontSize: 25, letterSpacing: -1, color: C.ink, fontWeight: "700" },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: "#fff" },

  summary: { paddingHorizontal: 12, paddingTop: 13, paddingBottom: 10 },
  summaryRow: { flexDirection: "row", marginTop: 12 },
  summaryItem: { flex: 1, paddingHorizontal: 10 },
  summaryMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: "#e1dcd4" },
  summaryLabel: { color: "#252725", fontSize: 11 },
  summaryValue: { marginTop: 6, color: C.green, fontSize: 17, fontWeight: "700" },
  summaryUnit: { fontSize: 11, fontWeight: "500" },

  chartCard: { marginTop: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 9 },
  chart: { marginTop: 8 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -4, marginLeft: 39, marginRight: 3 },
  chartLabel: { color: "#5f625d", fontSize: 9 },

  rankingCard: { marginTop: 10, padding: 12 },
  rankingRows: { marginTop: 9, gap: 5 },
  rankingRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  rankingName: { width: 72, fontSize: 12, color: C.ink },
  bar: { flex: 1, height: 7, borderRadius: 99, backgroundColor: "#f0eeea", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99, backgroundColor: C.green },
  rankingCount: { width: 50, color: C.green, fontSize: 12, fontWeight: "700", textAlign: "right" },

  historyCard: { marginTop: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  historyList: { marginTop: 4 },
  historyRow: { flexDirection: "row", alignItems: "center", minHeight: 30 },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: "#ebe6df" },
  historyDate: { width: 60, fontSize: 11, color: C.ink },
  historyName: { flex: 1, fontSize: 11, color: C.ink },
  historyQty: { width: 45, fontSize: 11, color: C.ink },
  historyPrice: { width: 73, fontSize: 11, color: C.ink, textAlign: "right" },
});
