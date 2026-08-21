// 생육 설정점 — 학습이 제안하고 규칙이 결정한다 (Phase W2).
//
// 이 값이 설비 운전점이 되고 → IoT 가동률이 되고 → 마일스톤 2·4단계 판정이 되고
// → 트랜치 집행으로 이어진다. 그래서 "모델이 낸 값"과 "실제로 적용한 값"을
// 나란히 보여준다. 하나만 보여주면 규칙이 왜 끼어들었는지 알 수 없다.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useFarmProjects } from "@/farmfi/branch";
import { useApiResource } from "@/farmfi/useApiResource";
import { VERDICT_META, type EnvelopeDecision, type SetpointsResponse } from "@/farmfi/api";
import { apiFetch, describeApiError } from "@/lib/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import {
  AppShell,
  Card,
  CardTitle,
  EmptyState,
  PrimaryButton,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

export default function SetpointsScreen() {
  const go = useGo();
  const { project, projectId } = useFarmProjects();
  const res = useApiResource<SetpointsResponse>(
    projectId ? `/api/projects/${projectId}/setpoints` : null,
    "설정점을 불러오지 못했습니다."
  );

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const env = res.data?.envelope;
  const decisions = env?.decisions ?? [];

  async function apply() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await apiFetch(`/api/projects/${projectId}/setpoints`, { method: "POST", body: "{}" });
      setMsg("적용했습니다. 다음 제어 주기부터 이 값으로 운전합니다.");
      res.reload();
    } catch (e) {
      setError(describeApiError(e, "적용하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      active="monitoring"
      storeName={project?.name}
      onStorePress={() => go.push("/store-select")}
    >
      {res.error && <StateNotice tone="error" message={res.error} onRetry={res.reload} />}
      {res.loading && (
        <>
          <SkeletonBlock height={120} radius={R.lg} />
          <SkeletonBlock height={380} radius={R.lg} />
        </>
      )}

      {!res.loading && !res.error && decisions.length === 0 && (
        <EmptyState
          icon="monitor"
          title="아직 제안할 설정점이 없어요"
          description="관측이 더 쌓이면 목표값을 제안합니다."
        />
      )}

      {decisions.length > 0 && env && (
        <>
          {/* 모델을 얼마나 믿을 수 있는지 먼저 밝힌다 */}
          <Card style={s.head}>
            <CardTitle>이번 제안</CardTitle>
            <Text style={s.headNote}>{env.note}</Text>
            <View style={s.metaRow}>
              <Meta label="반응면" value={res.data!.surface} />
              <Meta label="관측" value={`${res.data!.samples}건`} />
              <Meta
                label="설명력"
                value={res.data!.modelR2 === null ? "판정불가" : `R² ${res.data!.modelR2.toFixed(2)}`}
              />
            </View>
          </Card>

          <Text style={s.section}>요인별 판정</Text>
          {decisions.map((d) => (
            <DecisionCard key={d.feature} d={d} />
          ))}

          {msg && <Text style={s.ok}>{msg}</Text>}
          {error && <Text style={s.err}>{error}</Text>}

          <View style={s.applyRow}>
            <PrimaryButton
              label={busy ? "적용 중…" : env.anyApplied ? "이 설정점으로 운전하기" : "적용할 값이 없어요"}
              onPress={apply}
              disabled={busy || !env.anyApplied}
            />
            <Text style={s.applyNote}>
              규칙이 허용한 범위 안에서만 적용됩니다. 산출값과 적용값은 함께 기록돼요.
            </Text>
          </View>

          {(res.data?.history.length ?? 0) > 0 && (
            <>
              <Text style={s.section}>적용 이력</Text>
              <Card>
                {res.data!.history.slice(0, 5).map((h, i) => (
                  <View key={h.id} style={[s.histRow, i > 0 && s.histDivider]}>
                    <Text style={s.histDate}>{h.appliedAt.slice(0, 10)}</Text>
                    <Text style={s.histNote} numberOfLines={1}>
                      {h.adjusted === 0 ? "산출값 그대로" : `${h.adjusted}개 조정`}
                    </Text>
                    <Text style={s.histMeta}>관측 {h.samples}건</Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.meta}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

// ─── 요인 한 줄: 산출 → 적용, 그리고 왜 ───
function DecisionCard({ d }: { d: EnvelopeDecision }) {
  const meta = VERDICT_META[d.verdict];
  const changed = d.proposed !== null && d.proposed !== d.applied;
  const toneColor =
    meta.tone === "pass" ? C.brand : meta.tone === "adjust" ? C.body : C.danger;

  return (
    <Card style={s.dec}>
      <View style={s.decTop}>
        <Text style={s.decLabel}>{d.label}</Text>
        <Text style={[s.decVerdict, { color: toneColor }]}>{meta.label}</Text>
      </View>

      {/* 산출 → 적용. 같으면 화살표를 지운다 — 없는 변화를 그리지 않는다 */}
      <View style={s.decValues}>
        <View style={s.decCol}>
          <Text style={s.decColLabel}>모델 제안</Text>
          <Text style={[s.decProposed, changed && s.decStruck]}>
            {d.proposed ?? "—"}
            {d.unit}
          </Text>
        </View>
        {changed && <Text style={s.decArrow}>→</Text>}
        <View style={s.decCol}>
          <Text style={s.decColLabel}>적용</Text>
          <Text style={[s.decApplied, { color: toneColor }]}>
            {d.applied}
            {d.unit}
          </Text>
        </View>
        <View style={s.decColRight}>
          <Text style={s.decColLabel}>허용 범위</Text>
          <Text style={s.decBounds}>
            {d.bounds[0]}~{d.bounds[1]}
          </Text>
        </View>
      </View>

      {d.verdict !== "APPLIED" && <Text style={s.decReason}>{d.reason}</Text>}
    </Card>
  );
}

const s = StyleSheet.create({
  head: { padding: SP.lg, gap: SP.sm },
  headNote: { fontSize: FS.sm, color: C.body, lineHeight: 18 },
  metaRow: { flexDirection: "row", gap: SP.lg, marginTop: SP.xs },
  meta: { gap: 2 },
  metaLabel: { fontSize: FS.xs, color: C.muted },
  metaValue: { fontSize: FS.cap, fontWeight: FW.semibold, color: C.ink },

  section: { marginTop: SP.lg, fontSize: FS.md, fontWeight: FW.semibold, color: C.ink },

  dec: { padding: SP.lg, gap: SP.sm },
  decTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  decLabel: { fontSize: FS.md, fontWeight: FW.semibold, color: C.ink },
  decVerdict: { fontSize: FS.xs, fontWeight: FW.semibold },
  decValues: { flexDirection: "row", alignItems: "flex-end", gap: SP.md },
  decCol: { gap: 2 },
  decColRight: { marginLeft: "auto", alignItems: "flex-end", gap: 2 },
  decColLabel: { fontSize: FS.xs, color: C.muted },
  decProposed: { fontSize: FS.cap, color: C.muted },
  decStruck: { textDecorationLine: "line-through" },
  decArrow: { fontSize: FS.cap, color: C.muted, marginBottom: 1 },
  decApplied: { fontSize: FS.lg, fontWeight: FW.bold },
  decBounds: { fontSize: FS.sm, color: C.muted },
  decReason: {
    fontSize: FS.sm, color: C.body, lineHeight: 18,
    borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: SP.sm,
  },

  applyRow: { marginTop: SP.lg, gap: SP.sm },
  applyNote: { fontSize: FS.xs, color: C.muted, lineHeight: 16, textAlign: "center" },
  ok: { marginTop: SP.md, fontSize: FS.sm, color: C.brand },
  err: { marginTop: SP.md, fontSize: FS.sm, color: C.danger },

  histRow: { flexDirection: "row", alignItems: "center", gap: SP.md, paddingVertical: SP.sm },
  histDivider: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  histDate: { fontSize: FS.sm, color: C.muted, width: 84 },
  histNote: { flex: 1, fontSize: FS.sm, color: C.ink },
  histMeta: { fontSize: FS.xs, color: C.muted },
});
