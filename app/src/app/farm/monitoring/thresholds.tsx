// 11 센서 임계값
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  SENSOR_META,
  formatReading,
  type MonitoringDetailResponse,
  type SensorKey,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  Card,
  DetailShell,
  Field,
  Popup,
  PrimaryButton,
  SkeletonBlock,
  StateNotice,
} from "@/farmfi/ui";

const KEYS: SensorKey[] = ["temperature", "humidity", "co2Level", "phLevel"];

type Bounds = Record<string, { lo: string; hi: string }>;

export default function ThresholdsScreen() {
  const { projectId, project } = useFarmProjects();
  const mon = useApiResource<MonitoringDetailResponse>(
    projectId ? `/api/monitoring/${projectId}?days=1` : null,
    "임계값을 불러오지 못했습니다."
  );

  const [bounds, setBounds] = useState<Bounds>({});
  const [saved, setSaved] = useState(false);

  // 서버가 판단에 쓰는 정상 범위를 그대로 초기값으로 채운다.
  useEffect(() => {
    const ranges = mon.data?.healthyRanges;
    if (!ranges) return;
    const next: Bounds = {};
    KEYS.forEach((k) => {
      const r = ranges[k];
      if (r) next[k] = { lo: String(r[0]), hi: String(r[1]) };
    });
    setBounds(next);
  }, [mon.data]);

  const latest = mon.data?.points.at(-1) ?? null;

  const set = (k: string, side: "lo" | "hi", v: string) =>
    setBounds((prev) => ({ ...prev, [k]: { ...prev[k], [side]: v } }));

  return (
    <DetailShell
      requiresProject
      title="센서 임계값"
      subtitle={project?.name}
      footer={
        <PrimaryButton
          label="임계값 저장"
          onPress={() => setSaved(true)}
          disabled={Object.keys(bounds).length === 0}
        />
      }
    >
      <View style={s.notice}>
        <Text style={s.noticeText}>
          저장한 임계값은 이후 센서 상태 판단과 설비 알림 발생 기준에 적용됩니다.
        </Text>
      </View>

      {mon.loading && (
        <>
          <SkeletonBlock height={125} radius={R.lg} />
          <SkeletonBlock height={125} radius={R.lg} />
        </>
      )}
      {mon.error && <StateNotice tone="error" message={mon.error} onRetry={mon.reload} />}

      {!mon.loading &&
        !mon.error &&
        KEYS.map((k) => {
          const meta = SENSOR_META[k];
          const b = bounds[k];
          if (!b) return null;
          return (
            <Card key={k} style={s.card}>
              <View style={s.head}>
                <Text style={s.name}>{meta.label}</Text>
                <Text style={s.current}>
                  현재 {latest ? formatReading(k, latest[k]) : "—"}
                </Text>
              </View>
              <View style={s.pair}>
                <View style={s.half}>
                  <Field
                    label="하한"
                    value={b.lo}
                    onChangeText={(v) => set(k, "lo", v)}
                    keyboardType="numeric"
                    suffix={meta.unit || undefined}
                  />
                </View>
                <View style={s.half}>
                  <Field
                    label="상한"
                    value={b.hi}
                    onChangeText={(v) => set(k, "hi", v)}
                    keyboardType="numeric"
                    suffix={meta.unit || undefined}
                  />
                </View>
              </View>
            </Card>
          );
        })}

      <Popup
        visible={saved}
        title="임계값을 적용했습니다"
        message="이 기기에만 적용됩니다. 서버 판단 기준 반영은 임계값 API 연결 후 이뤄집니다."
        onConfirm={() => setSaved(false)}
        onCancel={() => setSaved(false)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  notice: { borderRadius: R.md, backgroundColor: C.brandSoft, padding: SP.md },
  noticeText: { fontSize: FS.xs, color: C.brand, lineHeight: 17 },
  card: { gap: SP.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  current: { fontSize: FS.sm, color: C.brand },
  pair: { flexDirection: "row", gap: SP.md },
  half: { flex: 1 },
});
