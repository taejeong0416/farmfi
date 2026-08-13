// 명세 3.2 재배 일정 등록 — 필수값 검증 후 저장, 저장되면 일정 목록으로 돌아간다.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { C } from "../theme";
import { type CropKind, type RackId } from "../data";
import { RACK_DATA } from "../demoData";
import { CropPixel } from "../components";
import { Card, CardTitle, DetailShell, Field, Popup, PrimaryButton , DemoBadge } from "../ui";

const RACKS: RackId[] = ["A", "B", "C", "D"];
const CROPS: Array<{ kind: CropKind; name: string }> = [
  { kind: "butter", name: "버터헤드" },
  { kind: "romaine", name: "로메인" },
  { kind: "basil", name: "바질" },
  { kind: "tomato", name: "방울토마토" },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function ScheduleNewScreen() {
  const router = useRouter();
  const [rack, setRack] = useState<RackId>("A");
  const [crop, setCrop] = useState<CropKind>("butter");
  const [sownAt, setSownAt] = useState("");
  const [harvestAt, setHarvestAt] = useState("");
  const [errors, setErrors] = useState<{ sownAt?: string; harvestAt?: string }>({});
  const [done, setDone] = useState(false);

  const submit = () => {
    const next: typeof errors = {};
    if (!DATE_PATTERN.test(sownAt)) next.sownAt = "YYYY-MM-DD 형식으로 입력해주세요.";
    if (!DATE_PATTERN.test(harvestAt)) next.harvestAt = "YYYY-MM-DD 형식으로 입력해주세요.";
    // 수확 예정일이 파종일보다 앞서면 일정이 성립하지 않는다.
    if (!next.sownAt && !next.harvestAt && harvestAt <= sownAt) {
      next.harvestAt = "수확 예정일은 파종일 이후여야 합니다.";
    }
    setErrors(next);
    if (Object.keys(next).length === 0) setDone(true);
  };

  return (
    <DetailShell title="재배 일정 등록" subtitle="파종일과 수확 예정일을 입력하세요">
      <DemoBadge />
      <Card>
        <CardTitle pixel="bed">베드 선택</CardTitle>
        <View style={s.chips}>
          {RACKS.map((r) => (
            <Text key={r} onPress={() => setRack(r)} style={[s.chip, r === rack && s.chipOn]}>
              베드 {r}
            </Text>
          ))}
        </View>
        <Text style={s.hint}>현재 베드 {rack} — {RACK_DATA[rack].crop} / {RACK_DATA[rack].stage}</Text>
      </Card>

      <Card>
        <CardTitle pixel="sprout">작물 선택</CardTitle>
        <View style={s.cropGrid}>
          {CROPS.map((c) => (
            <Text
              key={c.kind}
              onPress={() => setCrop(c.kind)}
              style={[s.cropCell, c.kind === crop && s.cropCellOn]}
            >
              {c.name}
            </Text>
          ))}
        </View>
        <View style={s.cropPreview}>
          <CropPixel kind={crop} size="medium" />
          <Text style={s.cropPreviewText}>{CROPS.find((c) => c.kind === crop)?.name}</Text>
        </View>
      </Card>

      <Card>
        <CardTitle icon="calendar">일정</CardTitle>
        <View style={s.form}>
          <Field
            label="파종일"
            required
            value={sownAt}
            onChangeText={setSownAt}
            placeholder="2026-08-20"
            error={errors.sownAt}
          />
          <Field
            label="수확 예정일"
            required
            value={harvestAt}
            onChangeText={setHarvestAt}
            placeholder="2026-09-30"
            error={errors.harvestAt}
          />
        </View>
      </Card>

      <PrimaryButton label="일정 저장" onPress={submit} />

      <Popup
        visible={done}
        title="재배 일정을 등록했어요"
        message={`베드 ${rack} · ${CROPS.find((c) => c.kind === crop)?.name}\n${sownAt} → ${harvestAt}`}
        onConfirm={() => {
          setDone(false);
          router.back();
        }}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", gap: 6, marginTop: 12 },
  chip: {
    flex: 1,
    height: 40,
    lineHeight: 40,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderRadius: 8,
    backgroundColor: "#fff",
    fontSize: 12,
    color: C.ink,
  },
  chipOn: { borderColor: C.green, backgroundColor: C.green, color: "#fff", fontWeight: "700" },
  hint: { marginTop: 9, fontSize: 11, color: C.muted },

  cropGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  cropCell: {
    minWidth: "47%",
    flexGrow: 1,
    height: 42,
    lineHeight: 42,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderRadius: 8,
    backgroundColor: "#fff",
    fontSize: 13,
    color: C.ink,
  },
  cropCellOn: { borderColor: C.green, backgroundColor: C.greenSoft, color: C.green, fontWeight: "700" },
  cropPreview: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12 },
  cropPreviewText: { fontSize: 12, color: C.muted },

  form: { marginTop: 12, gap: 12 },
});
