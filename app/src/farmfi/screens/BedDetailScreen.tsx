// 명세 4.1 베드 환경 모니터링 + 4.2 설비 제어.
// 제어는 낙관적으로 켜지 않고, 결과가 온 뒤 실제 상태를 반영한다(명세 예외: 응답 없으면 실패 후 재조회).
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { C, type Severity } from "../theme";
import { type RackId } from "../data";
import { BED_SENSORS, DEFAULT_THRESHOLDS, RACK_DATA, SENSOR_META, type Device, type SensorKey } from "../demoData";
import { GrowthRackScene } from "../components";
import { Badge, Card, CardTitle, DetailShell, GhostButton, PixelIcon, Popup, SensorTile, Toggle , DemoBadge } from "../ui";


const SENSOR_ORDER: SensorKey[] = ["temp", "humidity", "co2", "ec"];

// 임계 밖이면 위험, 임계 경계 10% 안쪽이면 주의.
// (클론B의 MonitoringScreen 은 API 연동본이라 이 판정을 갖고 있지 않아 여기서 정의한다)
function evaluate(key: SensorKey, value: number): Severity {
  const { min, max } = DEFAULT_THRESHOLDS[key];
  if (value < min || value > max) return "critical";
  const margin = (max - min) * 0.1;
  if (value < min + margin || value > max - margin) return "warning";
  return "normal";
}


type ControlResult = { ok: boolean; device: string; nextOn: boolean } | null;

export default function BedDetailScreen() {
  const router = useRouter();
  const { rack } = useLocalSearchParams<{ rack?: string }>();
  const rackId = (rack && ["A", "B", "C", "D"].includes(rack) ? rack : "A") as RackId;
  const bed = BED_SENSORS[rackId];
  const info = RACK_DATA[rackId];

  const [devices, setDevices] = useState<Device[]>(() => bed.devices.map((d) => ({ ...d })));
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<ControlResult>(null);
  // 같은 명령이 연속으로 나가지 않도록 잠근다(명세: 중복 전송 방지).
  const inFlight = useRef<Set<string>>(new Set());

  const control = (device: Device) => {
    if (!device.controllable || inFlight.current.has(device.key)) return;
    inFlight.current.add(device.key);
    setPending(device.key);

    // 데모: 환기팬만 응답 실패로 흘려 실패 경로를 보여준다.
    const willFail = device.key === "fan" && rackId === "D";
    setTimeout(() => {
      inFlight.current.delete(device.key);
      setPending(null);
      if (willFail) {
        setResult({ ok: false, device: device.name, nextOn: device.on });
        return;
      }
      const nextOn = !device.on;
      setDevices((prev) => prev.map((d) => (d.key === device.key ? { ...d, on: nextOn } : d)));
      setResult({ ok: true, device: device.name, nextOn });
    }, 650);
  };

  const states = SENSOR_ORDER.map((k) => evaluate(k, bed.readings[k]));
  const worst: Severity = states.includes("critical") ? "critical" : states.includes("warning") ? "warning" : "normal";

  return (
    <DetailShell
      title={`베드 ${rackId}`}
      subtitle={`${info.crop} · 최근 수신 ${bed.updatedAt}`}
      action={<Badge severity={worst} />}
    >
      <Card padded={false} style={s.sceneCard}>
        <View style={s.scene}>
          <GrowthRackScene kind={info.kind} maturity={info.maturity} />
        </View>
      </Card>

      <Card>
        <CardTitle icon="monitor">환경 센서</CardTitle>
        <View style={s.sensorGrid}>
          {SENSOR_ORDER.slice(0, 2).map((key) => (
            <SensorTile
              key={key}
              label={SENSOR_META[key].label}
              value={String(bed.readings[key])}
              unit={SENSOR_META[key].unit}
              state={evaluate(key, bed.readings[key])}
              icon={SENSOR_META[key].icon}
            />
          ))}
        </View>
        <View style={[s.sensorGrid, s.sensorGridSecond]}>
          {SENSOR_ORDER.slice(2).map((key) => (
            <SensorTile
              key={key}
              label={SENSOR_META[key].label}
              value={String(bed.readings[key])}
              unit={SENSOR_META[key].unit}
              state={evaluate(key, bed.readings[key])}
              icon={SENSOR_META[key].icon}
            />
          ))}
        </View>
        <Text style={s.thresholdHint}>
          기준 온도 {DEFAULT_THRESHOLDS.temp.min}~{DEFAULT_THRESHOLDS.temp.max}℃ · CO₂ {DEFAULT_THRESHOLDS.co2.min}~
          {DEFAULT_THRESHOLDS.co2.max}ppm
        </Text>
      </Card>

      <Card>
        <CardTitle icon="link">설비 제어</CardTitle>
        <View style={s.devices}>
          {devices.map((d) => (
            <View style={s.deviceRow} key={d.key}>
              <PixelIcon name={d.icon} size={30} />
              <View style={s.deviceCopy}>
                <Text style={s.deviceName}>{d.name}</Text>
                <Text style={s.deviceState}>
                  {pending === d.key ? "명령 전송 중…" : d.controllable ? (d.on ? "가동 중" : "정지") : "자동 제어 (수동 불가)"}
                </Text>
              </View>
              {d.controllable ? (
                <Toggle on={d.on} onChange={() => control(d)} />
              ) : (
                <Badge tone={{ fg: C.muted, bg: "#f1efeb" }} label="자동" />
              )}
            </View>
          ))}
        </View>
      </Card>

      <View style={s.actions}>
        <GhostButton label="센서 이력 그래프" icon="bars" onPress={() => router.push(`/farm/sensor-history?rack=${rackId}`)} />
        <GhostButton label="임계값 설정" icon="check" onPress={() => router.push(`/farm/threshold?rack=${rackId}`)} />
      </View>

      <Popup
        visible={!!result}
        severity={result?.ok ? "normal" : "critical"}
        title={result?.ok ? "제어 명령이 처리됐어요" : "제어에 실패했어요"}
        message={
          result?.ok
            ? `${result.device} — ${result.nextOn ? "가동" : "정지"} 상태로 변경됐습니다.`
            : `${result?.device} 응답이 없어 명령이 취소됐습니다. 설비 상태를 다시 조회했습니다.`
        }
        onConfirm={() => setResult(null)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  sceneCard: { overflow: "hidden" },
  scene: { aspectRatio: 1.35, backgroundColor: "#f4f3ef" },

  sensorGrid: { flexDirection: "row", gap: 7, marginTop: 12 },
  sensorGridSecond: { marginTop: 7 },
  thresholdHint: { marginTop: 10, fontSize: 10, color: C.muted },

  devices: { marginTop: 8 },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: "#f0ebe3",
  },
  deviceCopy: { flex: 1, gap: 3 },
  deviceName: { fontSize: 13, color: C.ink, fontWeight: "600" },
  deviceState: { fontSize: 11, color: C.muted },

  actions: { gap: 8 },
});
