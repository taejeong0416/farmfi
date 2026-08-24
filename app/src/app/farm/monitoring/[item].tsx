// 09 베드 상세 모니터링 (+ 20 제어 결과 성공 · 21 제어 결과 실패)
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { apiFetch } from "@/lib/api";
import {
  SENSOR_META,
  cropKindOf,
  formatReading,
  formatStamp,
  rackIdAt,
  readingSeverity,
  stageLabel,
  type DeviceCommandResult,
  type DeviceKind,
  type DeviceRecord,
  type DevicesResponse,
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

const DEVICE_ICON: Record<DeviceKind, IconName> = { led: "led", fan: "fan", pump: "drop" };

// 도면 순서(LED → 순환팬 → 관수 펌프). 서버는 kind 알파벳순으로 내려준다.
const KIND_ORDER: DeviceKind[] = ["led", "fan", "pump"];

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

  const items = inv.data?.projects[0]?.items ?? [];
  const index = items.findIndex((i) => i.productId === itemId);
  const item = index >= 0 ? items[index] : null;
  const bed = index >= 0 ? rackIdAt(index) : null;

  // 설비는 지점이 아니라 베드에 달린다 — 이 베드 것만 읽는다.
  const dev = useApiResource<DevicesResponse>(
    projectId && bed ? `/api/devices?projectId=${projectId}&bed=${bed}` : null,
    "설비 상태를 불러오지 못했습니다."
  );

  // 명령이 성공한 설비의 확정 상태. 목록을 다시 받지 않고 이 값만 덮어쓴다.
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // 팝업은 여닫힘(open)과 내용(result)을 따로 든다. 하나로 묶어 닫을 때 내용을 비우면
  // 페이드아웃하는 동안 실패 문구가 스쳐 지나간다 — 성공을 확인하고 닫았는데 "제어 실패"가
  // 뒤따라 보인다.
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    name: string;
    state: boolean;
    at: string;
    simulated?: boolean;
    reason?: string;
  } | null>(null);

  const show = (next: NonNullable<typeof result>) => {
    setResult(next);
    setOpen(true);
  };

  const latest = mon.data?.points.at(-1) ?? null;
  const ranges = mon.data?.healthyRanges;

  const devices = [...(dev.data?.devices ?? [])].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );
  const stateOf = (d: DeviceRecord) => applied[d.id] ?? d.isOn;

  // 제어 결과는 서버가 판정한다 — 응답이 성공이라고 말할 때만 스위치가 움직인다.
  const toggle = async (device: DeviceRecord, next: boolean) => {
    if (busy) return;
    setBusy(device.id);
    try {
      const res = await apiFetch<DeviceCommandResult>("/api/devices", {
        method: "POST",
        body: JSON.stringify({ deviceId: device.id, targetState: next }),
      });
      setApplied((prev) => ({ ...prev, [device.id]: res.isOn }));
      show({
        ok: true,
        name: device.name,
        state: res.isOn,
        at: new Date().toISOString(),
        simulated: res.simulated === true,
      });
    } catch (e) {
      // 중복 명령(409)·권한(401) 등 서버 판단을 그대로 보여준다. 바뀐 척하지 않는다.
      show({
        ok: false,
        name: device.name,
        state: stateOf(device),
        at: new Date().toISOString(),
        reason: e instanceof Error ? e.message : "제어 명령을 보내지 못했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

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

  const bedName = `베드 ${bed}`;
  const anyAlert = KEYS.some(
    (k) => latest && readingSeverity(k, latest[k], ranges) === "critical"
  );

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
        {dev.error && <StateNotice tone="error" message={dev.error} onRetry={dev.reload} />}
        {!dev.error && devices.length === 0 && (
          <Text style={s.rangeNote}>이 베드에 등록된 설비가 없습니다.</Text>
        )}
        {devices.map((d) => (
          <DeviceRow
            key={d.id}
            icon={DEVICE_ICON[d.kind]}
            name={d.name}
            state={
              busy === d.id
                ? "명령 전송 중"
                : d.pending
                  ? "이전 명령 처리 중"
                  : !d.controllable
                    ? "자동 제어"
                    : stateOf(d)
                      ? "가동 중"
                      : "정지"
            }
            on={stateOf(d)}
            onToggle={d.controllable ? (next) => toggle(d, next) : undefined}
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
        visible={open}
        glyph={result?.ok ? "✓" : "!"}
        tone={result?.ok ? "brand" : "danger"}
        title={result?.ok ? "제어 명령이 처리됐어요" : "제어 실패"}
        message={
          !result
            ? ""
            : result.ok
              ? `${result.name} — ${result.state ? "가동" : "정지"} 상태로 바꿨습니다.${
                  result.simulated
                    ? "\n설비 게이트웨이가 붙기 전이라 서버가 명령을 즉시 확정 처리했습니다. 실제 설비 상태를 함께 확인해주세요."
                    : ""
                }`
              : `${result.reason}\n요청 시각 ${formatStamp(result.at)} · 현재 설비 상태 ${
                  result.state ? "가동" : "정지"
                }`
        }
        cancelLabel={result?.ok ? undefined : "닫기"}
        confirmLabel={result?.ok ? "확인" : "다시 시도"}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
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
