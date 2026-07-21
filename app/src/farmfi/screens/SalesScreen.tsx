import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { C } from "../theme";
import { CHART_VALUES, SALES_HISTORY, SALES_RANKING } from "../data";
import { AppShell, BranchSelect, CropPixel, SectionTitle } from "../components";

function SalesLineChart() {
  const width = 320;
  const height = 126;
  const padX = 40;
  const padY = 12;
  const max = 200;
  const pts = CHART_VALUES.map((v, i) => {
    const x = padX + (i / (CHART_VALUES.length - 1)) * (width - padX - 8);
    const y = height - padY - (v / max) * (height - padY * 2);
    return { x, y };
  });
  const polyPoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const gridVals = [0, 50, 100, 150, 200];
  return (
    <View style={s.chart}>
      <Svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {gridVals.map((v) => {
          const y = height - padY - (v / max) * (height - padY * 2);
          return (
            <View key={v}>
              <Line x1={padX} x2={width - 8} y1={y} y2={y} stroke="#dadbd7" strokeDasharray="3 3" strokeWidth={1} />
              <SvgText x={2} y={y + 3} fill="#636660" fontSize={8}>
                {v === 0 ? "0" : `${v}만`}
              </SvgText>
            </View>
          );
        })}
        <Polyline points={polyPoints} fill="none" stroke={C.green} strokeWidth={2.1} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke={C.green} strokeWidth={2} />
        ))}
      </Svg>
      <View style={s.chartLabels}>
        {["7/1", "7/8", "7/15", "7/22", "7/29"].map((l) => (
          <Text key={l} style={s.chartLabel}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

export default function SalesScreen() {
  return (
    <AppShell active="sales">
      <BranchSelect calendar />
      <Text style={s.pageTitle}>판매 데이터 리포트</Text>

      <View style={[s.card, s.summary]}>
        <SectionTitle>7월 판매 요약</SectionTitle>
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>매출(원)</Text>
            <Text style={s.summaryValue}>2,450,000</Text>
          </View>
          <View style={[s.summaryItem, s.summaryMid]}>
            <Text style={s.summaryLabel}>판매량</Text>
            <Text style={s.summaryValue}>1,280<Text style={s.summaryUnit}>개</Text></Text>
          </View>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>주문수</Text>
            <Text style={s.summaryValue}>86<Text style={s.summaryUnit}>건</Text></Text>
          </View>
        </View>
      </View>

      <View style={[s.card, s.chartCard]}>
        <SectionTitle>일별 매출</SectionTitle>
        <SalesLineChart />
      </View>

      <View style={[s.card, s.rankingCard]}>
        <SectionTitle>인기 품목 TOP 4</SectionTitle>
        <View style={s.rankingRows}>
          {SALES_RANKING.map((item) => (
            <View style={s.rankingRow} key={item.name}>
              <CropPixel kind={item.kind} size="small" />
              <Text style={s.rankingName}>{item.name}</Text>
              <View style={s.bar}>
                <View style={[s.barFill, { width: `${item.value}%` }]} />
              </View>
              <Text style={s.rankingCount}>{item.count}개</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[s.card, s.historyCard]}>
        <SectionTitle>최근 판매 내역</SectionTitle>
        <View style={s.historyList}>
          {SALES_HISTORY.map((row, i) => (
            <View style={[s.historyRow, i < SALES_HISTORY.length - 1 && s.historyRowBorder]} key={`${row[0]}-${row[1]}`}>
              <Text style={s.historyDate}>{row[0]}</Text>
              <Text style={s.historyName}>{row[1]}</Text>
              <Text style={s.historyQty}>{row[2]}</Text>
              <Text style={s.historyPrice}>{row[3]}</Text>
            </View>
          ))}
        </View>
      </View>
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
