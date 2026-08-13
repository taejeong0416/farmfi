// 명세 6.2 리포트 내보내기 — 기간·형식을 골라 파일을 생성한다.
// 생성 실패 시 실패 안내 + 재시도를 제공한다(명세 예외).
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C } from "../theme";
import { EXPORT_FORMATS } from "../demoData";
import { TapScale } from "../components";
import { Card, CardTitle, DetailShell, KeyValueRow, PixelIcon, Popup, PrimaryButton, SegmentedTabs } from "../ui";

type Range = "week" | "month" | "quarter";
type Phase = "idle" | "working" | "done" | "failed";

const RANGE_LABEL: Record<Range, string> = { week: "이번 주", month: "이번 달", quarter: "최근 3개월" };
const RANGE_PERIOD: Record<Range, string> = {
  week: "2026-08-10 ~ 2026-08-13",
  month: "2026-08-01 ~ 2026-08-13",
  quarter: "2026-06-01 ~ 2026-08-13",
};

export default function ReportExportScreen() {
  const [range, setRange] = useState<Range>("month");
  const [format, setFormat] = useState<string>("csv");
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempt, setAttempt] = useState(0);

  const spec = EXPORT_FORMATS.find((f) => f.key === format) ?? EXPORT_FORMATS[0];

  const generate = () => {
    setPhase("working");
    const tries = attempt + 1;
    setAttempt(tries);
    // 데모: PDF 첫 시도만 실패시켜 재시도 흐름을 보여준다.
    const willFail = format === "pdf" && tries === 1;
    setTimeout(() => setPhase(willFail ? "failed" : "done"), 900);
  };

  return (
    <DetailShell title="리포트 내보내기" subtitle={RANGE_PERIOD[range]}>
      <Card>
        <CardTitle icon="calendar">기간</CardTitle>
        <View style={s.block}>
          <SegmentedTabs<Range>
            value={range}
            onChange={setRange}
            options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ key: r, label: RANGE_LABEL[r] }))}
          />
          <Text style={s.period}>{RANGE_PERIOD[range]}</Text>
        </View>
      </Card>

      <Card>
        <CardTitle icon="report">파일 형식</CardTitle>
        <View style={s.formats}>
          {EXPORT_FORMATS.map((f) => {
            const on = f.key === format;
            return (
              <TapScale key={f.key} scaleTo={0.99} onPress={() => setFormat(f.key)} style={[s.formatRow, on && s.formatRowOn]}>
                <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                <PixelIcon name={f.icon} size={34} />
                <View style={s.formatCopy}>
                  <Text style={[s.formatLabel, on && s.formatLabelOn]}>{f.label}</Text>
                  <Text style={s.formatCaption}>{f.caption}</Text>
                </View>
              </TapScale>
            );
          })}
        </View>
      </Card>

      <Card>
        <CardTitle icon="check">포함 내용</CardTitle>
        <View style={s.kv}>
          <KeyValueRow label="기간별 매출 집계" value="포함" tone={C.green} />
          <KeyValueRow label="품목별 판매량" value="포함" tone={C.green} />
          <KeyValueRow label="거래 건별 내역" value="포함" tone={C.green} />
          <KeyValueRow label="파일 형식" value={spec.label} />
        </View>
      </Card>

      <PrimaryButton
        label={phase === "working" ? "생성 중…" : "리포트 생성"}
        onPress={generate}
        disabled={phase === "working"}
      />

      <Popup
        visible={phase === "done"}
        title="리포트를 저장했어요"
        message={`${RANGE_LABEL[range]} · ${spec.label}\n기기 저장소에 내려받았습니다.`}
        onConfirm={() => setPhase("idle")}
      />
      <Popup
        visible={phase === "failed"}
        severity="critical"
        title="파일 생성에 실패했어요"
        message="네트워크 문제로 리포트를 만들지 못했습니다. 다시 시도해주세요."
        confirmLabel="재시도"
        cancelLabel="닫기"
        onConfirm={() => {
          setPhase("idle");
          generate();
        }}
        onCancel={() => setPhase("idle")}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  block: { marginTop: 12, gap: 9 },
  period: { fontSize: 11, color: C.muted },

  formats: { marginTop: 10, gap: 7 },
  formatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderRadius: 9,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  formatRowOn: { borderColor: C.green, backgroundColor: "#fbfdf9" },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 99,
    borderWidth: 1.6,
    borderColor: "#bcb0a0",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: C.green },
  radioDot: { width: 9, height: 9, borderRadius: 99, backgroundColor: C.green },
  formatCopy: { flex: 1, gap: 3 },
  formatLabel: { fontSize: 14, color: C.ink, fontWeight: "700" },
  formatLabelOn: { color: C.green },
  formatCaption: { fontSize: 11, color: C.muted, lineHeight: 16 },

  kv: { marginTop: 6 },
});
