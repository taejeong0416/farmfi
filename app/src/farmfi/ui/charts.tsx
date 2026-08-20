// Figma App/LineChart · App/BarChart.
// 값의 배열만 받고 축 눈금은 호출자가 라벨로 넘긴다 — 차트 안에서 데이터를 만들지 않는다.
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { C, FS, FW, R, SP } from "../theme";

const H = 140;

// 정상 범위를 띠로 깔고 그 위에 추이선을 그린다.
export function LineChart({
  title,
  points,
  band,
  caption,
  height = H,
}: {
  title?: string;
  points: number[];
  band?: { min: number; max: number };
  caption?: string;
  height?: number;
}) {
  const valid = points.filter((p) => Number.isFinite(p));
  const lo = Math.min(...valid, band?.min ?? Infinity);
  const hi = Math.max(...valid, band?.max ?? -Infinity);
  const span = hi - lo || 1;
  const pad = span * 0.12;
  const min = lo - pad;
  const max = hi + pad;
  const y = (v: number) => ((max - v) / (max - min)) * height;

  // viewBox 좌표계(0~100)로 그리고 preserveAspectRatio="none"으로 늘린다.
  const step = valid.length > 1 ? 100 / (valid.length - 1) : 0;
  const d = valid.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${y(v)}`).join(" ");

  return (
    <View style={s.wrap}>
      {title && <Text style={s.title}>{title}</Text>}
      <View style={[s.area, { height }]}>
        {valid.length > 1 ? (
          <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
            {band && (
              <Rect
                x="0"
                y={y(band.max)}
                width="100"
                height={Math.max(0, y(band.min) - y(band.max))}
                fill={C.brandSoft}
              />
            )}
            <Path d={d} stroke={C.brand} strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
          </Svg>
        ) : (
          <Text style={s.noData}>표시할 값이 없습니다</Text>
        )}
      </View>
      {caption && <Text style={s.caption}>{caption}</Text>}
    </View>
  );
}

export function BarChart({
  title,
  values,
  labels,
  caption,
  height = 153,
}: {
  title?: string;
  values: number[];
  labels?: string[];
  caption?: string;
  height?: number;
}) {
  const max = Math.max(...values, 1);
  return (
    <View style={s.wrap}>
      {title && <Text style={s.title}>{title}</Text>}
      <View style={[s.area, s.barArea, { height }]}>
        {values.length === 0 ? (
          <Text style={s.noData}>표시할 값이 없습니다</Text>
        ) : (
          values.map((v, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: `${Math.max(2, (v / max) * 100)}%`,
                borderRadius: 2,
                backgroundColor: C.brand,
              }}
            />
          ))
        )}
      </View>
      {labels && labels.length > 0 && (
        <View style={s.labels}>
          {labels.map((l) => (
            <Text style={s.labelText} key={l}>
              {l}
            </Text>
          ))}
        </View>
      )}
      {caption && <Text style={s.caption}>{caption}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: SP.sm },
  title: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },
  area: {
    borderRadius: R.md,
    backgroundColor: C.surface,
    overflow: "hidden",
    justifyContent: "center",
  },
  barArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    padding: SP.sm,
  },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  labelText: { fontSize: FS.xs, color: C.muted },
  caption: { fontSize: FS.xs, color: C.body },
  noData: { fontSize: FS.sm, color: C.muted, textAlign: "center", width: "100%" },
});
