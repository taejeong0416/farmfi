// 명세 4.2 센서 임계값 설정 — 항목별 하한/상한을 저장한다.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { C } from "../theme";
import { type RackId } from "../data";
import { BED_SENSORS, DEFAULT_THRESHOLDS, SENSOR_META, type SensorKey } from "../demoData";
import { Card, CardTitle, DetailShell, Field, Popup, PrimaryButton , DemoBadge } from "../ui";

const SENSOR_ORDER: SensorKey[] = ["temp", "humidity", "co2", "ec"];

type Draft = Record<SensorKey, { min: string; max: string }>;
type Errors = Partial<Record<SensorKey, string>>;

export default function ThresholdScreen() {
  const router = useRouter();
  const { rack } = useLocalSearchParams<{ rack?: string }>();
  const rackId = (rack && ["A", "B", "C", "D"].includes(rack) ? rack : "A") as RackId;

  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      SENSOR_ORDER.map((k) => [k, { min: String(DEFAULT_THRESHOLDS[k].min), max: String(DEFAULT_THRESHOLDS[k].max) }])
    ) as Draft
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);

  const setValue = (key: SensorKey, side: "min" | "max", text: string) => {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [side]: text } }));
  };

  const save = () => {
    const next: Errors = {};
    for (const key of SENSOR_ORDER) {
      const min = Number(draft[key].min);
      const max = Number(draft[key].max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        next[key] = "숫자만 입력해주세요.";
      } else if (min >= max) {
        next[key] = "하한값은 상한값보다 작아야 합니다.";
      }
    }
    setErrors(next);
    if (Object.keys(next).length === 0) setSaved(true);
  };

  return (
    <DetailShell title="센서 임계값" subtitle={`베드 ${rackId}`}>
      <DemoBadge />
      <Card>
        <Text style={s.note}>
          저장한 임계값은 이후 센서 상태 판단과 설비 알림 발생 기준에 적용됩니다.
        </Text>
      </Card>

      {SENSOR_ORDER.map((key) => {
        const meta = SENSOR_META[key];
        const current = BED_SENSORS[rackId].readings[key];
        return (
          <Card key={key}>
            <CardTitle icon="monitor" right={<Text style={s.current}>현재 {current}{meta.unit}</Text>}>
              {meta.label}
            </CardTitle>
            <View style={s.pair}>
              <View style={s.pairItem}>
                <Field
                  label="하한"
                  value={draft[key].min}
                  onChangeText={(t) => setValue(key, "min", t)}
                  keyboardType="numeric"
                  suffix={meta.unit}
                />
              </View>
              <View style={s.pairItem}>
                <Field
                  label="상한"
                  value={draft[key].max}
                  onChangeText={(t) => setValue(key, "max", t)}
                  keyboardType="numeric"
                  suffix={meta.unit}
                />
              </View>
            </View>
            {errors[key] ? <Text style={s.error}>{errors[key]}</Text> : null}
          </Card>
        );
      })}

      <PrimaryButton label="임계값 저장" onPress={save} />

      <Popup
        visible={saved}
        title="임계값을 저장했어요"
        message="다음 센서 수신부터 새 기준이 적용됩니다."
        onConfirm={() => {
          setSaved(false);
          router.back();
        }}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  note: { fontSize: 11, lineHeight: 17, color: C.muted },
  current: { fontSize: 11, color: C.green, fontWeight: "600" },
  pair: { flexDirection: "row", gap: 9, marginTop: 12 },
  pairItem: { flex: 1 },
  error: { marginTop: 8, fontSize: 11, color: C.danger },
});
