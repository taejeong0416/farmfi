// 07 재배 일정 등록
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { rackIdAt, type InventoryResponse } from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import {
  Card,
  DetailShell,
  Field,
  Popup,
  PrimaryButton,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

const BEDS = ["베드 A", "베드 B", "베드 C", "베드 D"];

export default function ScheduleNewScreen() {
  const go = useGo();
  const { projectId } = useFarmProjects();
  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "작물 목록을 불러오지 못했습니다."
  );

  const [bed, setBed] = useState(BEDS[0]);
  const [crop, setCrop] = useState<string | null>(null);
  const [plantDate, setPlantDate] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [done, setDone] = useState(false);

  const items = inv.data?.projects[0]?.items ?? [];
  // 등록 가능한 작물은 이 지점이 실제로 취급하는 품목이다.
  const crops = items.map((item, i) => ({
    id: item.productId,
    name: item.productName,
    bed: `베드 ${rackIdAt(i)}`,
  }));

  const ready = Boolean(crop && plantDate.trim());

  return (
    <DetailShell
      title="재배 일정 등록"
      footer={<PrimaryButton label="일정 등록" onPress={() => setDone(true)} disabled={!ready} />}
    >
      <Card style={s.card}>
        <Text style={s.groupTitle}>베드 선택</Text>
        <View style={s.grid}>
          {BEDS.map((b) => {
            const on = b === bed;
            return (
              <Pressable
                key={b}
                onPress={() => setBed(b)}
                style={[s.choice, on && s.choiceOn]}
              >
                <Text style={[s.choiceText, on && s.choiceTextOn]}>{b}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={s.card}>
        <Text style={s.groupTitle}>작물 선택</Text>
        {inv.error && <StateNotice tone="error" message={inv.error} onRetry={inv.reload} />}
        {!inv.loading && !inv.error && crops.length === 0 && (
          <Text style={s.quiet}>이 지점에 등록된 품목이 없습니다.</Text>
        )}
        <View style={s.grid}>
          {crops.map((c) => {
            const on = c.id === crop;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCrop(c.id)}
                style={[s.choice, s.choiceCrop, on && s.choiceOn]}
              >
                <View style={s.cropIcon}>
                  <AppIcon name="leaf" size={16} color={on ? C.brand : C.muted} />
                </View>
                <Text style={[s.choiceText, on && s.choiceTextOn]} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={s.card}>
        <Text style={s.groupTitle}>일정</Text>
        <Field
          label="파종일"
          required
          placeholder="2026-08-22"
          value={plantDate}
          onChangeText={setPlantDate}
        />
        <Field
          label="예상 수확일"
          placeholder="2026-09-19"
          value={harvestDate}
          onChangeText={setHarvestDate}
          hint="비워두면 작물 표준 재배일수로 계산합니다"
        />
      </Card>

      <Popup
        visible={done}
        title="일정을 등록했습니다"
        message="이 기기에만 남습니다. 서버 저장은 일정 API 연결 후 반영됩니다."
        onConfirm={() => {
          setDone(false);
          go.back();
        }}
        onCancel={() => setDone(false)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.md },
  groupTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  choice: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
  },
  choiceCrop: { flexDirection: "row", gap: SP.sm, minHeight: 49, paddingHorizontal: SP.md },
  choiceOn: { borderWidth: 2, borderColor: C.brand, backgroundColor: C.brandSoft },
  choiceText: { fontSize: FS.cap, color: C.body },
  choiceTextOn: { color: C.brand, fontWeight: FW.semibold },
  cropIcon: {
    width: 29,
    height: 29,
    borderRadius: R.xs,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  quiet: { fontSize: FS.cap, color: C.body },
});
