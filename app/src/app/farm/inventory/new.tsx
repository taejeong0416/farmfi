// 14 재고 품목 등록
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { Card, CardTitle, DetailShell, Field, Popup, PrimaryButton, useGo } from "@/farmfi/ui";

const CATEGORIES = ["엽채류", "쌈채소", "허브", "과채류"];
const UNITS = ["팩", "kg", "포기", "박스"];

export default function InventoryNewScreen() {
  const go = useGo();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [unit, setUnit] = useState(UNITS[0]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [threshold, setThreshold] = useState("");
  const [done, setDone] = useState(false);

  const ready = name.trim().length > 0;

  return (
    <DetailShell
      title="재고 품목 등록"
      footer={<PrimaryButton label="품목 등록" onPress={() => setDone(true)} disabled={!ready} />}
    >
      <Card style={s.card}>
        <CardTitle>분류</CardTitle>
        <View style={s.grid}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} on={c === category} onPress={() => setCategory(c)} />
          ))}
        </View>
      </Card>

      <Card style={s.card}>
        <CardTitle>품목 정보</CardTitle>
        <Field
          label="품목명"
          required
          placeholder="예) 버터헤드 상추"
          value={name}
          onChangeText={setName}
        />

        <View style={s.unitBlock}>
          <Text style={s.groupTitle}>단위</Text>
          <View style={s.grid}>
            {UNITS.map((u) => (
              <Chip key={u} label={u} on={u === unit} onPress={() => setUnit(u)} narrow />
            ))}
          </View>
        </View>

        <Field
          label="단가"
          placeholder="0"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          suffix="원"
        />
        <Field
          label="부족 기준"
          placeholder="5"
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="numeric"
          suffix={unit}
          hint="이 수량 아래로 내려가면 재고 부족으로 알립니다"
        />
      </Card>

      <Popup
        visible={done}
        title="품목을 등록했습니다"
        message="이 기기에만 남습니다. 서버 저장은 품목 등록 API 연결 후 반영됩니다."
        onConfirm={() => {
          setDone(false);
          go.back();
        }}
        onCancel={() => setDone(false)}
      />
    </DetailShell>
  );
}

function Chip({
  label,
  on,
  onPress,
  narrow = false,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  narrow?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[s.chip, narrow && s.chipNarrow, on && s.chipOn]}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.md },
  groupTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.body },
  unitBlock: { gap: SP.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  chip: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 41,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
  },
  chipNarrow: { flexBasis: "22%" },
  chipOn: { borderWidth: 2, borderColor: C.brand, backgroundColor: C.brandSoft },
  chipText: { fontSize: FS.body, color: C.body },
  chipTextOn: { color: C.brand, fontWeight: FW.semibold },
});
