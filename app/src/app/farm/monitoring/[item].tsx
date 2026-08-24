// 09 베드 상세 모니터링 (+ 20 제어 결과 성공 · 21 제어 결과 실패)
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  SENSOR_META,
  cropKindOf,
  formatReading,
  formatStamp,
  rackIdAt,
  readingSeverity,
  stageLabel,
  type InventoryResponse,
  type MonitoringDetailResponse,
  type SensorKey,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { type IconName } from "@/farmfi/icons";
import { GrowthRackScene } from "@/farmfi/components";
import {
  Badge,
  Card,
  CardTitle,
  DetailShell,
  DeviceRow,
  GhostButton,
  Popup,
  ProgressBar,
  SensorTile,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

const KEYS: SensorKey[] = ["temperature", "humidity", "co2Level", "phLevel"];

const DEVICES: { id: string; name: string; icon: IconName }[] = [
  { id: "led", name: "LED 조명", icon: "led" },
  { id: "fan", name: "순환팬", icon: "fan" },
  { id: "pump", name: "관수 펌프", icon: "drop" },
];

export default function BedDetailScreen() {
  const go = useGo();
  const { item: itemId } = useLocalSearchParams<{ item: string }>();
  const { projectId } = useFarmProjects();

  const inv = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "베드 정보를 불러오지 못했습니다."
  );
  const mon = useApiResource<MonitoringDetailResponse>(
    projectId ? `/api/monitoring/${projectId}?days=1` : null,
    "센서 값을 불러오지 못했습니다."
  );

  // 설비 제어 API가 아직 없다. 스위치는 이 화면 안에서만 움직인다.
  const [on, setOn] = useState<Record<string, boolean>>({ led: true, fan: true, pump: false });
  const [result, setResult] = useState<{
    ok: boolean;
    name: string;
    next: boolean;
    at: string;
  } | null>(null);

  const items = inv.data?.projects[0]?.items ?? [];
  const index = items.findIndex((i) => i.productId === itemId);
  const item = index >= 0 ? items[index] : null;
  const latest = mon.data?.points.at(-1) ?? null;
  const ranges = mon.data?.healthyRanges;

  if (inv.loading || mon.loading) {
    return (
      <DetailShell
      requiresProject title="베드 상세">
        <SkeletonBlock height={200} radius={R.lg} />
        <SkeletonBlock height={240} radius={R.lg} />
      </DetailShell>
    );
  }

  if (inv.error || !item) {
    return (
      <DetailShell title="베드 상세">
        <StateNotice
          tone="error"
          message={inv.error ?? "해당 베드를 찾을 수 없습니다."}
          onRetry={inv.reload}
        />
      </DetailShell>
    );
  }

  const bedName = `베드 ${rackIdAt(index)}`;
  const anyAlert = KEYS.some(
    (k) => latest && readingSeverity(k, latest[k], ranges) === "critical"
  );

  // 센서가 멈춘 지점은 설비가 바뀌었는지 확인할 길이 없다 — 성공이라고 말하지 않는다.
  const canConfirm = Boolean(mon.data && !mon.data.stale);

  const toggle = (id: string, name: string, next: boolean) => {
    if (canConfirm) setOn((prev) => ({ ...prev, [id]: next }));
    setResult({ ok: canConfirm, name, next, at: new Date().toISOString() });
  };

  return (
    <DetailShell
      title={bedName}
      subtitle={`${item.productName} · 최근 수신 ${
        mon.data?.dataAsOf ? formatStamp(mon.data.dataAsOf) : "—"
      }`}
    >
      {/* Figma의 SceneCard — 베드 장면 */}
      <Card style={s.sceneCard}>
        <View style={s.scene}>
          <GrowthRackScene
            kind={cropKindOf(item.productName, item.category)}
            maturity={item.maturityPercent}
          />
        </View>
        <View style={s.sceneHead}>
          <View style={s.sceneCopy}>
            <Text style={s.sceneCrop}>{item.productName}</Text>
            <Text style={s.sceneStage}>{stageLabel(item.maturityPercent)}</Text>
          </View>
          <Badge severity={anyAlert ? "critical" : "normal"} />
        </View>
        <View style={s.sceneBar}>
          <ProgressBar percent={item.maturityPercent} height={10} />
        </View>
        <View style={s.sceneMeta}>
          <Text style={s.sceneMetaText}>성숙도 {Math.round(item.maturityPercent)}%</Text>
          <Text style={s.sceneMetaText}>
            재배 중 {item.growing}
            {item.unit}
          </Text>
        </View>
      </Card>

      {/* 환경 센서 */}
      <Card style={s.card}>
        <CardTitle>환경 센서</CardTitle>
        {mon.error && <StateNotice tone="error" message={mon.error} onRetry={mon.reload} />}
        <View style={s.sensorGrid}>
          {KEYS.map((k) => (
            <SensorTile
              key={k}
              label={SENSOR_META[k].label}
              value={latest ? formatReading(k, latest[k]) : "—"}
              severity={latest ? readingSeverity(k, latest[k], ranges) : "normal"}
              onPress={() => go.push("/farm/monitoring/history")}
              style={s.sensorTile}
            />
          ))}
        </View>
        {ranges && (
          <Text style={s.rangeNote}>
            기준 온도 {ranges.temperature?.[0]}~{ranges.temperature?.[1]}℃ · CO₂{" "}
            {ranges.co2Level?.[0]}~{ranges.co2Level?.[1]}ppm
          </Text>
        )}
      </Card>

      {/* 설비 제어 */}
      <Card style={s.card}>
        <CardTitle>설비 제어</CardTitle>
        {DEVICES.map((d) => (
          <DeviceRow
            key={d.id}
            icon={d.icon}
            name={d.name}
            state={on[d.id] ? "가동 중" : "정지"}
            on={on[d.id]}
            onToggle={(next) => toggle(d.id, d.name, next)}
          />
        ))}
      </Card>

      <View style={s.actions}>
        <GhostButton
          label="센서 이력 보기"
          icon="bars"
          tone="brand"
          onPress={() => go.push("/farm/monitoring/history")}
        />
        <GhostButton
          label="센서 임계값 설정"
          icon="settings"
          tone="brand"
          onPress={() => go.push("/farm/monitoring/thresholds")}
        />
      </View>

      {/* 20 제어 결과 성공 · 21 제어 결과 실패 */}
      <Popup
        visible={result !== null}
        glyph={result?.ok ? "✓" : "!"}
        tone={result?.ok ? "brand" : "danger"}
        title={result?.ok ? "제어 명령이 처리됐어요" : "제어 실패"}
        message={
          !result
            ? ""
            : result.ok
              ? `${result.name} — ${result.next ? "가동" : "정지"} 상태로 바꿨습니다. 실제 설비 반영은 제어 API 연결 후 이뤄집니다.`
              : `${result.name}이(가) 응답하지 않습니다. 실제 설비 상태를 다시 확인해주세요.\n실패 시각 ${formatStamp(
                  result.at
                )} · 현재 설비 상태 ${on[
                  DEVICES.find((d) => d.name === result.name)?.id ?? ""
                ]
                  ? "가동"
                  : "정지"}`
        }
        cancelLabel={result?.ok ? undefined : "닫기"}
        confirmLabel={result?.ok ? "확인" : "다시 시도"}
        onConfirm={() => setResult(null)}
        onCancel={() => setResult(null)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  card: { gap: SP.md },
  sceneCard: { gap: SP.md, padding: 0, overflow: "hidden" },
  // 베드 이미지가 1536x1024(3:2)다. 컨테이너를 같은 비율로 잡아야 잘리지도 늘어나지도
  // 않고, 그래야 식물 슬롯 좌표(%)가 구멍에 정확히 얹힌다.
  scene: { aspectRatio: 3 / 2, backgroundColor: C.surface },
  sceneHead: { flexDirection: "row", alignItems: "center", gap: SP.md, paddingHorizontal: SP.md },
  sceneBar: { paddingHorizontal: SP.md },
  sceneCopy: { flex: 1, gap: 2 },
  sceneCrop: { fontSize: FS.xl, fontWeight: FW.semibold, color: C.ink },
  sceneStage: { fontSize: FS.cap, color: C.body },
  sceneMeta: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: SP.md, paddingBottom: SP.md },
  sceneMetaText: { fontSize: FS.sm, color: C.body },

  sensorGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  sensorTile: { flexBasis: "47%", flexGrow: 1 },
  rangeNote: { fontSize: FS.xs, color: C.body },

  actions: { gap: SP.sm },
});
