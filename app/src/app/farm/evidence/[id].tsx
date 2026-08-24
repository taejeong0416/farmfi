// M-13 증빙 제출 — 촬영으로 만드는 증빙(영수증·현장 사진)은 전부 여기서 올린다.
// 웹 O-11은 계약서 PDF 업로드와 조회만 하는 보조 경로다(명세 8장).
//
// 카메라는 시스템 카메라앱을 부른다(expo-image-picker). 앱 안에 프리뷰를 두면
// 웹 배포가 깨지고, 명세가 요구하는 것도 "촬영 또는 갤러리 선택"이지 프리뷰가 아니다.
//
// 파일 해시는 서버가 업로드 시점에 계산해 돌려준다. 그 지문이 증빙과 함께 저장되고,
// 체인에는 원본이 아니라 이 해시만 올라간다.
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { useApiResource } from "@/farmfi/useApiResource";
import {
  MILESTONE_STAGE_LABEL,
  SIGNAL_META,
  canSubmitEvidence,
  formatWon,
  type Milestone,
} from "@/farmfi/api";
import { uploadImage, submitEvidence, type UploadedFile } from "@/lib/upload";
import { describeApiError } from "@/lib/api";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import { PIXEL_ICON } from "@/farmfi/assets";
import {
  Card,
  DetailShell,
  Field,
  GhostButton,
  PrimaryButton,
  SkeletonBlock,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

type Attached = UploadedFile & { localUri: string };

export default function EvidenceSubmitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const go = useGo();
  const res = useApiResource<{ milestone: Milestone }>(
    id ? `/api/milestones/${id}/evidence` : null,
    "단계 정보를 불러오지 못했습니다."
  );

  const [files, setFiles] = useState<Attached[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const m = res.data?.milestone;
  const slots = m?.requiredSignals.length ?? 1;
  // 이미 낸 것과 이번에 붙인 것을 합쳐서 센다. 보완 요청이면 앞서 낸 것도 살아 있다.
  const already = m?.evidenceUrls.length ?? 0;
  const total = already + files.length;
  const enough = total >= slots;
  const editable = m ? canSubmitEvidence(m.status) : false;

  async function pick(from: "camera" | "library") {
    setError(null);
    try {
      const perm =
        from === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          from === "camera"
            ? "카메라 권한이 필요해요. 설정에서 허용해 주세요."
            : "사진 접근 권한이 필요해요. 설정에서 허용해 주세요."
        );
        return;
      }

      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        // 서버 상한이 8MB다. 원본 그대로 올리면 최근 폰 사진은 넘긴다.
        quality: 0.7,
      };
      const picked =
        from === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true });

      if (picked.canceled || picked.assets.length === 0) return;

      setBusy(true);
      const added: Attached[] = [];
      for (const asset of picked.assets) {
        const name = asset.fileName ?? `evidence-${Date.now()}.jpg`;
        const up = await uploadImage(asset.uri, name);
        added.push({ ...up, localUri: asset.uri });
      }
      setFiles((prev) => [...prev, ...added]);
    } catch (e) {
      setError(describeApiError(e, "사진을 올리지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!id || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await submitEvidence(id, {
        urls: files.map((f) => f.url),
        hashes: files.map((f) => f.sha256),
        note: note.trim(),
      });
      setDone(true);
      res.reload();
    } catch (e) {
      setError(describeApiError(e, "제출하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  if (res.loading || !m) {
    return (
      <DetailShell title="증빙 제출">
        {res.error ? (
          <StateNotice tone="error" message={res.error} onRetry={res.reload} />
        ) : (
          <SkeletonBlock height={420} radius={R.lg} />
        )}
      </DetailShell>
    );
  }

  if (done) {
    return (
      <DetailShell title="증빙 제출" subtitle={m.project.name}>
        <Card style={st.doneCard}>
          <Image source={PIXEL_ICON["stage-cleared"]} style={st.doneArt} resizeMode="contain" />
          <Text style={st.doneTitle}>{m.seq}단계 증빙을 제출했어요</Text>
          <Text style={st.doneBody}>
            검증과 관리자 승인을 거치면 {formatWon(m.releaseAmount)}원이 집행됩니다.
            결과는 알림으로 알려드릴게요.
          </Text>
          {/* 이 화면은 단계 목록에서 열린다. replace로 목록을 또 쌓으면 스택에
              목록이 두 겹이 되어, 돌아간 뒤 뒤로가기가 같은 화면을 다시 그린다. */}
          <PrimaryButton label="단계 목록으로" onPress={() => go.back("/farm/evidence")} />
        </Card>
      </DetailShell>
    );
  }

  return (
    <DetailShell title={`${m.seq}단계 증빙`} subtitle={m.name}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>
        {/* 무엇을 왜 내는지 */}
        <Card style={st.head}>
          <View style={st.headTop}>
            <Text style={st.headName}>{m.name}</Text>
            <Text style={st.headState}>
              {MILESTONE_STAGE_LABEL[m.status] ?? m.status}
            </Text>
          </View>
          <Text style={st.headCondition}>{m.conditionText ?? m.description ?? ""}</Text>
          <View style={st.headReward}>
            <Text style={st.headRewardLabel}>승인되면 집행</Text>
            <Text style={st.headRewardValue}>{formatWon(m.releaseAmount)}원</Text>
          </View>
        </Card>

        {m.status === "revision_required" && m.reviewNote && (
          <View style={st.revise}>
            <Text style={st.reviseTitle}>보완 요청</Text>
            <Text style={st.reviseBody}>{m.reviewNote}</Text>
          </View>
        )}

        {/* 필요한 증빙 종류 */}
        <Text style={st.section}>필요한 증빙</Text>
        <View style={st.signalGrid}>
          {m.requiredSignals.map((sig) => {
            const meta = SIGNAL_META[sig];
            return (
              <View key={sig} style={st.signalCard}>
                {meta ? (
                  <Image source={PIXEL_ICON[meta.icon]} style={st.signalIcon} resizeMode="contain" />
                ) : (
                  <AppIcon name="file" size={26} color={C.body} />
                )}
                <Text style={st.signalLabel}>{meta?.label ?? sig}</Text>
                <Text style={st.signalHint}>
                  {meta?.capture ? "촬영" : sig === "iot" ? "자동 수집" : "웹에서 PDF"}
                </Text>
              </View>
            );
          })}
        </View>

        {/* 진행 */}
        <View style={st.countRow}>
          {Array.from({ length: Math.max(slots, total) }).map((_, i) => (
            <View key={i} style={[st.slot, i < total && st.slotFilled]} />
          ))}
          <Text style={st.countText}>
            {total} / {slots}
            {already > 0 ? `  (이전 제출 ${already})` : ""}
          </Text>
        </View>

        {/* 붙인 사진 */}
        {files.length > 0 && (
          <View style={st.thumbRow}>
            {files.map((f, i) => (
              <View key={f.url} style={st.thumbWrap}>
                <Image source={{ uri: f.localUri }} style={st.thumb} />
                <Pressable
                  style={st.thumbX}
                  onPress={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  hitSlop={8}
                >
                  <Text style={st.thumbXText}>×</Text>
                </Pressable>
                {/* 지문 앞 6자리 — 같은 파일을 두 번 올렸는지 눈으로 구분된다 */}
                <Text style={st.thumbHash}>{f.sha256.slice(0, 6)}</Text>
              </View>
            ))}
          </View>
        )}

        {editable ? (
          <View style={st.pickRow}>
            <GhostButton label="사진 촬영" onPress={() => pick("camera")} disabled={busy} />
            <GhostButton label="갤러리에서" onPress={() => pick("library")} disabled={busy} />
          </View>
        ) : (
          <Text style={st.lockedNote}>
            지금은 제출할 수 있는 단계가 아니에요. 검토 결과를 기다려 주세요.
          </Text>
        )}

        <Field
          label="설명 (선택)"
          placeholder="예: 설비 영수증 2장, 8월 12일 구매"
          value={note}
          onChangeText={setNote}
          multiline
        />

        {error && <Text style={st.error}>{error}</Text>}

        <View style={st.submitRow}>
          <PrimaryButton
            label={busy ? "처리 중…" : enough ? "제출하기" : `증빙 ${slots - total}개 더 필요해요`}
            onPress={submit}
            disabled={busy || !editable || files.length === 0 || !enough}
          />
          <Text style={st.submitNote}>
            제출하면 검증과 관리자 승인을 거칩니다. 승인 전에는 자금이 집행되지 않아요.
          </Text>
        </View>
      </ScrollView>
    </DetailShell>
  );
}

const st = StyleSheet.create({
  body: { gap: SP.lg, paddingBottom: SP.xxl },

  head: { padding: SP.lg, gap: SP.sm },
  headTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headName: { flex: 1, fontSize: FS.lg, fontWeight: FW.bold, color: C.ink },
  headState: { fontSize: FS.xs, fontWeight: FW.semibold, color: C.body },
  headCondition: { fontSize: FS.sm, color: C.muted, lineHeight: 18 },
  headReward: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: SP.md, marginTop: SP.xs,
  },
  headRewardLabel: { fontSize: FS.sm, color: C.muted },
  headRewardValue: { fontSize: FS.xl, fontWeight: FW.bold, color: C.brand },

  revise: {
    backgroundColor: C.surface, borderRadius: R.md, padding: SP.md, gap: 4,
    borderLeftWidth: 3, borderLeftColor: C.danger,
  },
  reviseTitle: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.danger },
  reviseBody: { fontSize: FS.sm, color: C.body, lineHeight: 18 },

  section: { fontSize: FS.md, fontWeight: FW.semibold, color: C.ink },
  signalGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  signalCard: {
    flexGrow: 1, minWidth: 92, alignItems: "center", gap: 5,
    backgroundColor: C.surface, borderRadius: R.md, paddingVertical: SP.md,
  },
  signalIcon: { width: 30, height: 30 },
  signalLabel: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.ink },
  signalHint: { fontSize: FS.xs, color: C.muted },

  countRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  slot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: C.line },
  slotFilled: { backgroundColor: C.brand, borderColor: C.brand },
  countText: { marginLeft: SP.xs, fontSize: FS.sm, color: C.body },

  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  thumbWrap: { width: 78 },
  thumb: { width: 78, height: 78, borderRadius: R.md, backgroundColor: C.surface },
  thumbX: {
    position: "absolute", top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11, backgroundColor: C.ink,
    alignItems: "center", justifyContent: "center",
  },
  thumbXText: { color: C.paper, fontSize: FS.cap, lineHeight: 15 },
  thumbHash: { marginTop: 3, fontSize: FS.xs, color: C.muted, textAlign: "center" },

  pickRow: { flexDirection: "row", gap: SP.sm },
  lockedNote: { fontSize: FS.sm, color: C.muted, lineHeight: 18 },
  error: { fontSize: FS.sm, color: C.danger, lineHeight: 18 },

  submitRow: { gap: SP.sm },
  submitNote: { fontSize: FS.xs, color: C.muted, lineHeight: 16, textAlign: "center" },

  doneCard: { padding: SP.xl, alignItems: "center", gap: SP.md },
  doneArt: { width: 120, height: 120 },
  doneTitle: { fontSize: FS.xl, fontWeight: FW.bold, color: C.ink, textAlign: "center" },
  doneBody: { fontSize: FS.sm, color: C.body, lineHeight: 19, textAlign: "center" },
});
