// 17 리포트 내보내기
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  Card,
  Checkbox,
  DetailShell,
  Popup,
  PrimaryButton,
  Radio,
  useGo,
} from "@/farmfi/ui";

const PERIODS = [
  { key: "week", label: "이번 주", days: 7 },
  { key: "month", label: "이번 달", days: 30 },
  { key: "quarter", label: "최근 3개월", days: 90 },
];

const FORMATS = [
  { key: "csv", label: "CSV", hint: "엑셀·구글시트에서 바로 열 수 있는 표 형식" },
  { key: "xlsx", label: "Excel", hint: "서식이 적용된 .xlsx 파일" },
  { key: "pdf", label: "PDF", hint: "인쇄·공유용 리포트 문서" },
];

const SECTIONS = [
  { key: "summary", label: "기간별 매출 집계" },
  { key: "product", label: "품목별 판매량" },
  { key: "rows", label: "거래 건별 내역" },
];

function rangeLabel(days: number): string {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export default function ExportScreen() {
  const go = useGo();
  const [period, setPeriod] = useState(PERIODS[1]);
  const [format, setFormat] = useState(FORMATS[0].key);
  const [sections, setSections] = useState(SECTIONS.map((s) => s.key));
  const [done, setDone] = useState(false);

  const toggle = (key: string) =>
    setSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <DetailShell
      title="리포트 내보내기"
      footer={
        <PrimaryButton
          label="리포트 만들기"
          icon="download"
          onPress={() => setDone(true)}
          disabled={sections.length === 0}
        />
      }
    >
      <Card style={s.card}>
        <Text style={s.groupTitle}>기간</Text>
        <View style={s.row}>
          {PERIODS.map((p) => {
            const on = p.key === period.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPeriod(p)}
                style={[s.periodChip, on && s.chipOn]}
              >
                <Text style={[s.periodText, on && s.chipTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.range}>{rangeLabel(period.days)}</Text>
      </Card>

      <Card style={s.card}>
        <Text style={s.groupTitle}>파일 형식</Text>
        {FORMATS.map((f) => {
          const on = f.key === format;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFormat(f.key)}
              style={[s.optionRow, on && s.chipOn]}
            >
              <Radio selected={on} onChange={() => setFormat(f.key)} />
              <View style={s.optionCopy}>
                <Text style={s.optionLabel}>{f.label}</Text>
                <Text style={s.optionHint}>{f.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Card style={s.card}>
        <Text style={s.groupTitle}>포함 내용</Text>
        {SECTIONS.map((sec) => (
          <Pressable key={sec.key} style={s.checkRow} onPress={() => toggle(sec.key)}>
            <Checkbox checked={sections.includes(sec.key)} onChange={() => toggle(sec.key)} />
            <Text style={s.checkLabel}>{sec.label}</Text>
          </Pressable>
        ))}
      </Card>

      <Popup
        visible={done}
        title="내보내기 설정을 확인했습니다"
        message={`${period.label} · ${format.toUpperCase()} · ${sections.length}개 항목. 파일 생성은 리포트 API 연결 후 이뤄집니다.`}
        onConfirm={() => {
          setDone(false);
          go.back("/farm/sales");
        }}
        onCancel={() => setDone(false)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.md },
  groupTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  row: { flexDirection: "row", gap: SP.sm },

  periodChip: {
    flex: 1,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
  },
  periodText: { fontSize: FS.sm, color: C.body },
  chipOn: { borderWidth: 2, borderColor: C.brand, backgroundColor: C.brandSoft },
  chipTextOn: { color: C.brand, fontWeight: FW.semibold },
  range: { fontSize: FS.sm, color: C.body },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    minHeight: 56,
    paddingHorizontal: SP.md,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
  },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },
  optionHint: { fontSize: FS.xs, color: C.body },

  checkRow: { flexDirection: "row", alignItems: "center", gap: SP.md, paddingVertical: SP.sm },
  checkLabel: { fontSize: FS.cap, color: C.ink },
});
