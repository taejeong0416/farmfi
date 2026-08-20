// Figma App/Calendar — 월 단위 격자. 표시할 날짜에 점을 찍는다.
import { StyleSheet, Text, Pressable, View } from "react-native";

import { C, FS, FW, R, SP } from "../theme";
import { AppIcon } from "../icons";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function Calendar({
  year,
  month,
  selected,
  marked = [],
  onSelect,
  onShift,
}: {
  year: number;
  month: number; // 1~12
  selected?: number;
  marked?: number[];
  onSelect?: (day: number) => void;
  onShift?: (delta: number) => void;
}) {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Pressable onPress={() => onShift?.(-1)} hitSlop={10}>
          <AppIcon name="chevron-left" size={18} color={C.body} />
        </Pressable>
        <Text style={s.title}>
          {year}년 {month}월
        </Text>
        <Pressable onPress={() => onShift?.(1)} hitSlop={10}>
          <AppIcon name="chevron-right" size={18} color={C.body} />
        </Pressable>
      </View>

      <View style={s.week}>
        {WEEKDAYS.map((w) => (
          <Text style={s.weekday} key={w}>
            {w}
          </Text>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View style={s.week} key={ri}>
          {row.map((d, ci) => {
            if (d === null) return <View style={s.cell} key={`e${ci}`} />;
            const on = d === selected;
            return (
              <Pressable style={s.cell} key={d} onPress={() => onSelect?.(d)}>
                <View style={[s.day, on && { backgroundColor: C.brand }]}>
                  <Text style={[s.dayText, on && { color: C.paper, fontWeight: FW.semibold }]}>{d}</Text>
                </View>
                <View style={[s.dot, marked.includes(d) && { backgroundColor: C.brand }]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    backgroundColor: C.paper,
    padding: SP.md,
    gap: SP.sm,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: FS.xs, color: C.muted, paddingVertical: SP.xs },
  cell: { flex: 1, alignItems: "center", paddingVertical: 3, gap: 2 },
  day: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: FS.cap, color: C.ink },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent" },
});
