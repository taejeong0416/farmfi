// 명세 3.1 작물 생육 현황 조회 + 3.2 생육 기록 저장.
// 목록(재배·생육 현황)에서 베드를 눌러 들어오며, 이력은 최신순으로 쌓인다.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { C } from "../theme";
import { type RackId } from "../data";
import { GROWTH_LOGS, RACK_DATA, type GrowthLog } from "../demoData";
import { GrowthRackScene } from "../components";
import {
  Card,
  CardTitle,
  DetailShell,
  EmptyState,
  Field,
  KeyValueRow,
  Popup,
  PrimaryButton,
  ProgressBar,
  TimelineRow,
  DemoBadge,
} from "../ui";

const STAGES = ["파종기", "성장기", "결구기", "착과기", "수확기"];

export default function CropDetailScreen() {
  const { rack } = useLocalSearchParams<{ rack?: string }>();
  const rackId = (rack && ["A", "B", "C", "D"].includes(rack) ? rack : "A") as RackId;
  const info = RACK_DATA[rackId];

  const [logs, setLogs] = useState<GrowthLog[]>(() => GROWTH_LOGS.filter((l) => l.rack === rackId));
  const [stage, setStage] = useState(info.stage);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const stageIndex = useMemo(() => Math.max(0, STAGES.indexOf(stage)), [stage]);

  const save = () => {
    // 명세 3.2 예외: 필수 입력값이 없으면 저장하지 않고 오류를 안내한다.
    if (!note.trim()) {
      setError("관찰 내용을 입력해주세요.");
      return;
    }
    setError(null);
    setLogs((prev) => [
      {
        id: `GL-${Date.now()}`,
        rack: rackId,
        at: "방금 전",
        stage,
        note: note.trim(),
        author: "운영자 1",
      },
      ...prev,
    ]);
    setNote("");
    setSaved(true);
  };

  return (
    <DetailShell title={`${info.crop} 생육 상세`} subtitle={`베드 ${rackId} · ${info.stage}`}>
      <DemoBadge />
      <Card padded={false} style={s.sceneCard}>
        <View style={s.scene}>
          <GrowthRackScene kind={info.kind} maturity={info.maturity} />
        </View>
        <View style={s.sceneMeta}>
          <View style={s.maturityRow}>
            <Text style={s.maturityLabel}>성숙도</Text>
            <Text style={s.maturityValue}>{info.maturity}%</Text>
          </View>
          <ProgressBar value={info.maturity} />
        </View>
      </Card>

      <Card>
        <CardTitle pixel="sprout">생육 단계</CardTitle>
        <View style={s.stages}>
          {STAGES.map((st, i) => {
            const done = i <= stageIndex;
            return (
              <View key={st} style={s.stageItem}>
                <View style={[s.stageDot, done && s.stageDotOn]} />
                <Text style={[s.stageLabel, done && s.stageLabelOn]}>{st}</Text>
              </View>
            );
          })}
        </View>
        <View style={s.kvBlock}>
          <KeyValueRow label="생육 상태" value={info.state} tone={C.green} />
          <KeyValueRow label="습도" value={`${info.humidity}%`} />
          <KeyValueRow label="배정 베드" value={`베드 ${rackId}`} />
        </View>
      </Card>

      <Card>
        <CardTitle icon="plus">생육 기록 입력</CardTitle>
        <View style={s.form}>
          <View style={s.stagePicker}>
            {STAGES.map((st) => (
              <Text
                key={st}
                onPress={() => setStage(st)}
                style={[s.stageChip, st === stage && s.stageChipOn]}
              >
                {st}
              </Text>
            ))}
          </View>
          <Field
            label="관찰 내용"
            required
            multiline
            value={note}
            onChangeText={setNote}
            placeholder="예) 잎 색 균일, 수확 적기 도달"
            error={error}
          />
          <PrimaryButton label="기록 저장" onPress={save} />
        </View>
      </Card>

      <Card>
        <CardTitle icon="clock">기록 이력</CardTitle>
        {logs.length === 0 ? (
          <EmptyState title="기록이 없어요" caption="첫 생육 기록을 남겨보세요." />
        ) : (
          <View style={s.timeline}>
            {logs.map((l, i) => (
              <TimelineRow
                key={l.id}
                time={`${l.at} · ${l.author}`}
                title={l.stage}
                caption={l.note}
                last={i === logs.length - 1}
              />
            ))}
          </View>
        )}
      </Card>

      <Popup
        visible={saved}
        title="기록을 저장했어요"
        message="작물 이력에 반영됐습니다."
        onConfirm={() => setSaved(false)}
      />
    </DetailShell>
  );
}

const s = StyleSheet.create({
  sceneCard: { overflow: "hidden" },
  scene: { aspectRatio: 1.25, backgroundColor: "#f4f3ef" },
  sceneMeta: { paddingHorizontal: 13, paddingVertical: 11, gap: 7 },
  maturityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  maturityLabel: { fontSize: 12, color: C.muted },
  maturityValue: { fontSize: 15, color: C.green, fontWeight: "700" },

  stages: { flexDirection: "row", marginTop: 13 },
  stageItem: { flex: 1, alignItems: "center", gap: 6 },
  stageDot: { width: 11, height: 11, borderRadius: 99, borderWidth: 2, borderColor: "#d3ccc1", backgroundColor: "#fff" },
  stageDotOn: { borderColor: C.green, backgroundColor: C.green },
  stageLabel: { fontSize: 9, color: "#8d908a" },
  stageLabelOn: { color: C.green, fontWeight: "700" },

  kvBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#f0ebe3", paddingTop: 4 },

  form: { marginTop: 12, gap: 11 },
  stagePicker: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stageChip: {
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderRadius: 99,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 7,
    fontSize: 11,
    color: C.ink,
  },
  stageChipOn: { borderColor: C.green, backgroundColor: C.green, color: "#fff", fontWeight: "700" },

  timeline: { marginTop: 13 },
});
