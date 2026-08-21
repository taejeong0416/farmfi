// M-13 증빙 제출 · 마일스톤 확인 — 매장 개점 여정을 스테이지 맵으로 그린다.
//
// 마일스톤은 원래 게임의 스테이지와 구조가 같다. 순서대로만 열리고, 조건을
// 채워야 다음이 열리고, 통과하면 보상(트랜치 집행)이 나온다. 그 성질을 화면이
// 그대로 쓴다 — 없는 재미를 덧붙이는 게 아니라 있는 구조를 드러내는 것이다.
//
// 잠금 규칙은 서버 집행 게이트(canRelease)와 같은 판정을 쓴다. 화면에서 열어 놓고
// 서버가 거절하면 운영자는 이유를 모른 채 막힌다.
import { Image, StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import {
  MILESTONE_STAGE_LABEL,
  SIGNAL_META,
  canSubmitEvidence,
  formatWon,
  stageStateOf,
  type Milestone,
  type MilestonesResponse,
  type StageState,
} from "@/farmfi/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { PIXEL_ICON } from "@/farmfi/assets";
import {
  AppShell,
  Card,
  EmptyState,
  PrimaryButton,
  ProgressBar,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

export default function EvidenceStagesScreen() {
  const go = useGo();
  const { project, projectId } = useFarmProjects();
  const res = useApiResource<MilestonesResponse>(
    projectId ? `/api/milestones?projectId=${projectId}` : null,
    "단계 정보를 불러오지 못했습니다."
  );

  const milestones = [...(res.data?.milestones ?? [])].sort((a, b) => a.seq - b.seq);
  const doneCount = milestones.filter((m) => m.status === "completed").length;
  const releasedTotal = milestones
    .filter((m) => m.status === "completed")
    .reduce((sum, m) => sum + m.releaseAmount, 0);

  return (
    <AppShell
      active="dashboard"
      storeName={project?.name}
      onStorePress={() => go.push("/store-select")}
    >
      {res.error && <StateNotice tone="error" message={res.error} onRetry={res.reload} />}
      {res.loading && (
        <>
          <SkeletonBlock height={132} radius={R.lg} />
          <SkeletonBlock height={420} radius={R.lg} />
        </>
      )}

      {!res.loading && !res.error && milestones.length === 0 && (
        <EmptyState
          icon="leaf"
          title="아직 단계가 없어요"
          description="투자 프로젝트가 열리면 개점 단계가 여기에 나타납니다."
        />
      )}

      {milestones.length > 0 && (
        <>
          {/* 여정 요약 — 지금 어디쯤 왔는지 한 줄로 */}
          <Card style={s.summary}>
            <View style={s.summaryTop}>
              <Text style={s.summaryTitle}>매장 개점 여정</Text>
              <Text style={s.summaryCount}>
                <Text style={s.summaryCountNow}>{doneCount}</Text>
                <Text> / {milestones.length}단계</Text>
              </Text>
            </View>
            <View style={s.summaryBar}>
              <ProgressBar percent={(doneCount / milestones.length) * 100} height={9} />
            </View>
            <Text style={s.summaryFoot}>
              지금까지 <Text style={s.summaryMoney}>{formatWon(releasedTotal)}원</Text> 집행됐어요
            </Text>
          </Card>

          {/* 스테이지 맵 */}
          <View style={s.map}>
            {milestones.map((m, i) => (
              <StageCard
                key={m.id}
                milestone={m}
                state={stageStateOf(m, milestones)}
                last={i === milestones.length - 1}
                onPress={() => go.push(`/farm/evidence/${m.id}`)}
              />
            ))}
          </View>

          <Text style={s.footNote}>
            단계는 순서대로 열려요. 증빙이 승인돼야 그 단계 자금이 집행됩니다.
          </Text>
        </>
      )}
    </AppShell>
  );
}

// ─── 스테이지 한 칸 ───
function StageCard({
  milestone,
  state,
  last,
  onPress,
}: {
  milestone: Milestone;
  state: StageState;
  last: boolean;
  onPress: () => void;
}) {
  const m = milestone;
  const locked = state === "locked";
  const done = state === "done";

  // 증빙 슬롯 — 필요한 종류 수만큼 점을 찍고, 낸 개수만큼 채운다.
  // 종류별 대응이 아니라 개수 대응이다: 서버가 파일-종류 매핑을 요구하지 않는다.
  const slots = m.requiredSignals.length || 1;
  const filled = Math.min(m.evidenceUrls.length, slots);

  return (
    <View>
      <Card style={[s.stage, locked && s.stageLocked, done && s.stageDone]}>
        <View style={s.stageHead}>
          {/* 상태를 픽셀 아이콘으로 — 잠김·진행중·완료가 색과 형태 둘 다로 갈린다.
              단계 번호는 아이콘 옆에 작게 둔다(아이콘만으로는 몇 단계인지 모른다). */}
          <View style={s.stageMark}>
            <Image
              source={PIXEL_ICON[done ? "stage-done" : locked ? "stage-locked" : "stage-active"]}
              style={s.stageIcon}
              resizeMode="contain"
            />
            <Text style={[s.seqText, locked && s.mutedText]}>{m.seq}단계</Text>
          </View>
          <View style={s.stageTitleCol}>
            <Text style={[s.stageName, locked && s.mutedText]} numberOfLines={1}>
              {m.name}
            </Text>
            <Text style={s.stageCondition} numberOfLines={2}>
              {locked
                ? `${m.seq - 1}단계를 마치면 열려요`
                : (m.conditionText ?? m.description ?? "조건 없음")}
            </Text>
          </View>
          <Text style={[s.stageState, done && s.stateDone, locked && s.mutedText]}>
            {done ? "집행 완료" : locked ? "잠김" : (MILESTONE_STAGE_LABEL[m.status] ?? m.status)}
          </Text>
        </View>

        {/* 보상 — 이 단계를 통과하면 나오는 금액 */}
        <View style={s.rewardRow}>
          <Text style={[s.rewardLabel, locked && s.mutedText]}>
            {done ? "집행됨" : "집행 예정"}
          </Text>
          <Text style={[s.rewardValue, done && s.rewardDone, locked && s.mutedText]}>
            {formatWon(m.releaseAmount)}원
          </Text>
          <Text style={[s.rewardPct, locked && s.mutedText]}>
            {Math.round(m.releasePct / 100)}%
          </Text>
        </View>

        {!locked && (
          <>
            {/* 증빙 슬롯 */}
            <View style={s.slotRow}>
              {Array.from({ length: slots }).map((_, i) => (
                <View key={i} style={[s.slot, i < filled && s.slotFilled]} />
              ))}
              <Text style={s.slotText}>
                증빙 {filled}/{slots}
              </Text>
              <View style={s.signalTags}>
                {m.requiredSignals.map((sig) => (
                  <Text key={sig} style={s.signalTag}>
                    {SIGNAL_META[sig]?.label ?? sig}
                  </Text>
                ))}
              </View>
            </View>

            {/* 보완 요청은 그 자리에서 사유를 보여준다 — 다시 찾아 들어가게 하지 않는다 */}
            {m.status === "revision_required" && m.reviewNote && (
              <View style={s.reviseBox}>
                <Text style={s.reviseTitle}>보완 요청</Text>
                <Text style={s.reviseBody}>{m.reviewNote}</Text>
              </View>
            )}

            {!done && (
              <View style={s.actionRow}>
                <PrimaryButton
                  label={
                    m.status === "revision_required"
                      ? "다시 제출하기"
                      : m.evidenceUrls.length > 0
                        ? "증빙 확인·추가"
                        : "증빙 제출하기"
                  }
                  onPress={onPress}
                  disabled={!canSubmitEvidence(m.status)}
                />
              </View>
            )}
            {done && (
              <Text style={s.doneNote}>
                {m.completedAt ? `${m.completedAt.slice(0, 10)} 집행 완료` : "집행 완료"}
              </Text>
            )}
          </>
        )}
      </Card>

      {/* 스테이지를 잇는 선 — 순서가 있다는 걸 형태로 말한다 */}
      {!last && <View style={[s.connector, done && s.connectorDone]} />}
    </View>
  );
}

const s = StyleSheet.create({
  summary: { padding: SP.lg, gap: SP.md },
  summaryTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  summaryTitle: { fontSize: FS.lg, fontWeight: FW.bold, color: C.ink },
  summaryCount: { fontSize: FS.cap, color: C.muted },
  summaryCountNow: { fontSize: FS.h2, fontWeight: FW.bold, color: C.brand },
  summaryBar: { marginTop: SP.xs },
  summaryFoot: { fontSize: FS.sm, color: C.body },
  summaryMoney: { fontWeight: FW.bold, color: C.ink },

  map: { marginTop: SP.lg },

  stage: { padding: SP.lg, gap: SP.md },
  stageLocked: { opacity: 0.55 },
  stageDone: { borderColor: C.brandSoft },
  stageHead: { flexDirection: "row", alignItems: "flex-start", gap: SP.md },
  stageMark: { width: 40, alignItems: "center", gap: 2 },
  stageIcon: { width: 34, height: 34 },
  seqText: { fontSize: FS.xs, fontWeight: FW.semibold, color: C.body },
  stageTitleCol: { flex: 1, gap: 3 },
  stageName: { fontSize: FS.md, fontWeight: FW.semibold, color: C.ink },
  stageCondition: { fontSize: FS.sm, color: C.muted, lineHeight: 17 },
  stageState: { fontSize: FS.xs, fontWeight: FW.semibold, color: C.body },
  stateDone: { color: C.brand },
  mutedText: { color: C.muted },

  rewardRow: {
    flexDirection: "row", alignItems: "baseline", gap: SP.sm,
    borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: SP.md,
  },
  rewardLabel: { fontSize: FS.sm, color: C.muted },
  rewardValue: { flex: 1, fontSize: FS.lg, fontWeight: FW.bold, color: C.ink },
  rewardDone: { color: C.brand },
  rewardPct: { fontSize: FS.sm, color: C.muted },

  slotRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  slot: {
    width: 9, height: 9, borderRadius: 5,
    borderWidth: 1.5, borderColor: C.line, backgroundColor: "transparent",
  },
  slotFilled: { backgroundColor: C.brand, borderColor: C.brand },
  slotText: { marginLeft: SP.xs, fontSize: FS.sm, color: C.body },
  signalTags: { flexDirection: "row", gap: 5, marginLeft: "auto" },
  signalTag: {
    fontSize: FS.xs, color: C.muted,
    backgroundColor: C.surface, paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.sm,
  },

  reviseBox: {
    backgroundColor: C.surface, borderRadius: R.md, padding: SP.md, gap: 4,
    borderLeftWidth: 3, borderLeftColor: C.danger,
  },
  reviseTitle: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.danger },
  reviseBody: { fontSize: FS.sm, color: C.body, lineHeight: 18 },

  actionRow: { marginTop: SP.xs },
  doneNote: { fontSize: FS.sm, color: C.muted },

  connector: {
    width: 2, height: 18, marginLeft: SP.lg + 19,
    backgroundColor: C.line, marginVertical: 2,
  },
  connectorDone: { backgroundColor: C.brand },

  footNote: { marginTop: SP.md, fontSize: FS.sm, color: C.muted, lineHeight: 18 },
});
