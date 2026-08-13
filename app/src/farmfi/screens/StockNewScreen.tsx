// 명세 5.2 재고 품목 등록 — 품목명은 매장 내 고유, 초기 수량은 0 이상.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { C } from "../theme";
import { type CropKind } from "../data";
import { STOCK_ROWS } from "../demoData";
import { CropPixel } from "../components";
import { Card, CardTitle, DetailShell, Field, Popup, PrimaryButton , DemoBadge } from "../ui";

const KINDS: Array<{ kind: CropKind; name: string }> = [
  { kind: "butter", name: "엽채류" },
  { kind: "romaine", name: "쌈채소" },
  { kind: "basil", name: "허브" },
  { kind: "tomato", name: "과채류" },
];

const UNITS = ["팩", "kg", "포기", "박스"];

export default function StockNewScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CropKind>("butter");
  const [unit, setUnit] = useState(UNITS[0]);
  const [initial, setInitial] = useState("0");
  const [minQty, setMinQty] = useState("");
  const [errors, setErrors] = useState<{ name?: string; initial?: string; minQty?: string }>({});
  const [done, setDone] = useState(false);

  const submit = () => {
    const next: typeof errors = {};
    const trimmed = name.trim();
    if (!trimmed) {
      next.name = "품목명을 입력해주세요.";
    } else if (STOCK_ROWS.some((r) => r.name === trimmed)) {
      // 명세 예외: 동일 품목명이 이미 등록되어 있으면 중복 등록을 안내한다.
      next.name = "이미 등록된 품목명입니다.";
    }

    const initialNum = Number(initial);
    if (!Number.isFinite(initialNum) || initialNum < 0) {
      next.initial = "초기 수량은 0 이상이어야 합니다.";
    }

    const minNum = Number(minQty);
    if (!minQty.trim() || !Number.isFinite(minNum) || minNum < 0) {
      next.minQty = "부족 기준을 0 이상 숫자로 입력해주세요.";
    }

    setErrors(next);
    if (Object.keys(next).length === 0) setDone(true);
  };

  return (
    <DetailShell title="재고 품목 등록" subtitle="품목 기본 정보를 입력하세요">
      <DemoBadge />
      <Card>
        <CardTitle pixel="basket">품목 분류</CardTitle>
        <View style={s.kinds}>
          {KINDS.map((k) => (
            <View key={k.kind} style={s.kindWrap}>
              <Text onPress={() => setKind(k.kind)} style={[s.kindCell, k.kind === kind && s.kindCellOn]}>
                {k.name}
              </Text>
            </View>
          ))}
        </View>
        <View style={s.preview}>
          <CropPixel kind={kind} size="medium" />
          <Text style={s.previewText}>목록에서 이 아이콘으로 표시됩니다</Text>
        </View>
      </Card>

      <Card>
        <CardTitle icon="plus">기본 정보</CardTitle>
        <View style={s.form}>
          <Field
            label="품목명"
            required
            value={name}
            onChangeText={setName}
            placeholder="예) 프릴아이스"
            error={errors.name}
          />

          <View>
            <Text style={s.fieldLabel}>단위</Text>
            <View style={s.units}>
              {UNITS.map((u) => (
                <Text key={u} onPress={() => setUnit(u)} style={[s.unitChip, u === unit && s.unitChipOn]}>
                  {u}
                </Text>
              ))}
            </View>
          </View>

          <Field
            label="초기 수량"
            required
            value={initial}
            onChangeText={setInitial}
            keyboardType="numeric"
            suffix={unit}
            error={errors.initial}
          />
          <Field
            label="부족 기준 수량"
            required
            value={minQty}
            onChangeText={setMinQty}
            keyboardType="numeric"
            placeholder="이 수량 이하면 부족 알림"
            suffix={unit}
            error={errors.minQty}
          />
        </View>
      </Card>

      <PrimaryButton label="품목 등록" onPress={submit} />

      <Popup
        visible={done}
        title="품목을 등록했어요"
        message={`${name.trim()} — 초기 ${initial}${unit} / 부족 기준 ${minQty}${unit}`}
        onConfirm={() => {
          setDone(false);
          router.back();
        }}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  kindWrap: { width: "47.5%", flexGrow: 1 },
  kindCell: {
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
  kindCellOn: { borderColor: C.green, backgroundColor: C.greenSoft, color: C.green, fontWeight: "700" },
  preview: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12 },
  previewText: { fontSize: 11, color: C.muted },

  form: { marginTop: 12, gap: 12 },
  fieldLabel: { fontSize: 12, color: "#3c3f3a", fontWeight: "600", marginBottom: 6 },
  units: { flexDirection: "row", gap: 6 },
  unitChip: {
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
  unitChipOn: { borderColor: C.green, backgroundColor: C.green, color: "#fff", fontWeight: "700" },
});
