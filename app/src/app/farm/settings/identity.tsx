// 본인인증 — OACX 모바일 운전면허증(App2App).
//
// QR은 쓰지 않는다. QR 흐름은 "우리가 QR을 띄우고 사용자의 신분증 앱이 그것을
// 스캔"하는 구조라 PC 웹 전용이다. 폰 하나로 띄우고 같은 폰으로 스캔할 수 없다.
// 앱에서는 딥링크로 신분증 앱을 직접 연다.
//
// 화면이 이 모양인 이유:
//  · 신분증 앱이 우리 앱으로 돌아온다는 계약이 없다 → AppState 복귀 감지 + 수동 버튼
//  · OACX JWT 가 5분이다 → 남은 시간을 보여주고 만료되면 새 거래를 튼다
//  · 제출 전 result 는 실패가 아니라 202 pending 이다 → 실패로 표시하지 않는다
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, View } from "react-native";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, FS, FW, R, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import {
  Card,
  DetailShell,
  Divider,
  GhostButton,
  PrimaryButton,
  StateNotice,
  useGo,
} from "@/farmfi/ui";

type Stage = "intro" | "waiting" | "verified" | "failed";

type StartResponse = {
  txId: string;
  androidLink: string | null;
  iosLink: string | null;
  ssPayLink: string | null;
  expiresInSec: number;
};

type ResultResponse = {
  status: "verified" | "pending";
  realName?: string | null;
  adult?: boolean | null;
  message?: string;
};

function mmss(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function IdentityScreen() {
  const go = useGo();
  const { user } = useAuth();

  const [stage, setStage] = useState<Stage>(user?.identityVerified ? "verified" : "intro");
  const [txId, setTxId] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ realName?: string | null; adult?: boolean | null }>({
    realName: user?.realName ?? null,
  });

  // 제출 확인이 두 경로(복귀 감지 · 수동 버튼)에서 동시에 들어올 수 있다.
  const checking = useRef(false);

  const check = useCallback(
    async (id: string, opts?: { silent?: boolean }) => {
      if (checking.current) return;
      checking.current = true;
      if (!opts?.silent) setBusy(true);
      try {
        const res = await apiFetch<ResultResponse>("/api/identity/oacx/result", {
          method: "POST",
          body: JSON.stringify({ txId: id }),
        });
        if (res.status === "verified") {
          setResult({ realName: res.realName, adult: res.adult });
          setStage("verified");
        } else if (!opts?.silent) {
          // 202 는 실패가 아니다. 아직 제출이 안 끝났을 뿐이다.
          setError(res.message ?? "아직 제출이 완료되지 않았습니다.");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "인증 결과 확인에 실패했습니다.";
        if (!opts?.silent) {
          setError(msg);
          setStage("failed");
        }
      } finally {
        checking.current = false;
        if (!opts?.silent) setBusy(false);
      }
    },
    []
  );

  // 신분증 앱에서 돌아오면 조용히 한 번 확인한다. 실패해도 화면을 바꾸지 않는다 —
  // 사용자가 그냥 앱을 전환했을 수도 있다.
  useEffect(() => {
    if (stage !== "waiting" || !txId) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void check(txId, { silent: true });
    });
    return () => sub.remove();
  }, [stage, txId, check]);

  // 남은 시간. 0이 되면 거래가 만료돼 result 가 통하지 않는다.
  useEffect(() => {
    if (stage !== "waiting") return;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [stage]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<StartResponse>("/api/identity/oacx/start", {
        method: "POST",
        body: JSON.stringify({ mode: "app", requestType: "APP2APP" }),
      });
      setTxId(res.txId);
      setLeft(res.expiresInSec ?? 300);
      setStage("waiting");

      // 행안부 권고: 삼성월렛이 함께 있으면 ssPayLink, 모바일 신분증만이면 androidLink.
      const link =
        Platform.OS === "ios" ? res.iosLink : res.ssPayLink ?? res.androidLink;
      if (link) {
        const ok = await Linking.canOpenURL(link).catch(() => false);
        if (ok) await Linking.openURL(link);
        else setError("모바일 신분증 앱을 열 수 없습니다. 앱이 설치돼 있는지 확인해주세요.");
      } else {
        setError("이 기기에서 열 수 있는 인증 링크를 받지 못했습니다.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증을 시작하지 못했습니다.");
      setStage("failed");
    } finally {
      setBusy(false);
    }
  };

  // ── 완료 ──
  if (stage === "verified") {
    return (
      <DetailShell title="본인인증">
        <Card style={s.doneCard}>
          <View style={s.doneIcon}>
            <AppIcon name="check" size={32} color={C.brand} />
          </View>
          <Text style={s.doneTitle}>본인확인이 완료됐어요</Text>
          {result.realName ? <Text style={s.doneName}>{result.realName}</Text> : null}
          {result.adult != null ? (
            <Text style={s.doneSub}>{result.adult ? "성인 확인됨" : "미성년"}</Text>
          ) : null}
        </Card>

        <Card>
          <Text style={s.privacyTitle}>보관하는 정보</Text>
          <Text style={s.privacyBody}>
            실명과 성인 여부, 중복가입 확인용 식별자만 남깁니다. 주소·전화번호·
            생년월일 원본과 실명확인 식별자 원문은 저장하지 않습니다.
          </Text>
        </Card>

        <GhostButton label="설정으로" onPress={() => go.back()} />
      </DetailShell>
    );
  }

  // ── 대기 ──
  if (stage === "waiting") {
    const expired = left <= 0;
    return (
      <DetailShell title="본인인증">
        <Card style={s.waitCard}>
          <Text style={s.waitTitle}>
            {expired ? "인증 시간이 지났어요" : "신분증 앱에서 제출해주세요"}
          </Text>
          <Text style={s.waitSub}>
            {expired
              ? "다시 시도하면 새 인증을 시작합니다."
              : "모바일 운전면허증을 선택하고 생체인증을 마친 뒤 돌아와 주세요."}
          </Text>
          {!expired ? <Text style={s.timer}>{mmss(left)}</Text> : null}
        </Card>

        {error ? <StateNotice tone="error" message={error} /> : null}

        {expired ? (
          <PrimaryButton label="다시 시도" onPress={start} disabled={busy} />
        ) : (
          <>
            <PrimaryButton
              label={busy ? "확인 중…" : "인증 완료했어요"}
              onPress={() => txId && check(txId)}
              disabled={busy}
            />
            <GhostButton label="취소" onPress={() => setStage("intro")} />
          </>
        )}
      </DetailShell>
    );
  }

  // ── 안내 · 실패 ──
  return (
    <DetailShell title="본인인증">
      {stage === "failed" && error ? <StateNotice tone="error" message={error} /> : null}

      <Card>
        <Text style={s.introTitle}>모바일 운전면허증으로 본인확인</Text>
        <Text style={s.introBody}>
          정부 모바일 신분증 앱에 발급된 운전면허증으로 실명을 확인합니다.
        </Text>
      </Card>

      <Card>
        <Text style={s.needTitle}>준비물</Text>
        <Divider />
        <NeedRow text="정부 「모바일 신분증」 앱 설치" />
        <Divider />
        <NeedRow text="앱에 발급된 모바일 운전면허증" />
        <Text style={s.needNote}>
          운전면허증이 발급돼 있지 않으면 인증이 진행되지 않습니다. 주민등록증은
          현재 이 서비스에서 제출받을 수 없습니다.
        </Text>
      </Card>

      <PrimaryButton
        label={busy ? "여는 중…" : stage === "failed" ? "다시 시도" : "인증 시작"}
        onPress={start}
        disabled={busy}
      />
    </DetailShell>
  );
}

function NeedRow({ text }: { text: string }) {
  return (
    <View style={s.needRow}>
      <View style={s.dot} />
      <Text style={s.needText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  introTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  introBody: { marginTop: SP.sm, fontSize: FS.body, lineHeight: 20, color: C.body },

  needTitle: { fontSize: FS.md, fontWeight: FW.semibold, color: C.ink, marginBottom: SP.sm },
  needRow: { flexDirection: "row", alignItems: "center", gap: SP.sm, paddingVertical: SP.sm },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.brand },
  needText: { flex: 1, fontSize: FS.body, color: C.body },
  needNote: { marginTop: SP.sm, fontSize: FS.cap, lineHeight: 18, color: C.muted },

  waitCard: { alignItems: "center", gap: SP.sm, paddingVertical: SP.xl },
  waitTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  waitSub: { fontSize: FS.body, lineHeight: 20, color: C.body, textAlign: "center" },
  timer: { marginTop: SP.sm, fontSize: FS.hero, fontWeight: FW.bold, color: C.brand },

  doneCard: { alignItems: "center", gap: SP.sm, paddingVertical: SP.xl },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  doneName: { fontSize: FS.hero, fontWeight: FW.bold, color: C.ink },
  doneSub: { fontSize: FS.body, color: C.muted },

  privacyTitle: { fontSize: FS.md, fontWeight: FW.semibold, color: C.ink },
  privacyBody: { marginTop: SP.sm, fontSize: FS.cap, lineHeight: 19, color: C.body },
});
