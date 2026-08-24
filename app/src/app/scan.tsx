// M-02 보증서 확인 — 실제 카메라로 QR을 읽고 서버에 대조한다.
//
// 명세가 "보증서 번호 입력 또는 QR 스캔"이라 두 경로를 다 둔다. QR은 카메라가
// 있을 때만 열리고, 카메라를 못 쓰는 환경(웹 브라우저 권한 거부, 바코드 스캔
// 미지원)에서는 번호 입력이 그 자리를 메운다. 되는 척하지 않는다.
//
// 판정은 서버가 한다. GET /api/operator/credential이 상태·만료를 계산해
// `check.valid`와 사유를 내려주고, 앱은 스캔한 번호가 그 보증서와 같은지만 본다.
// 앱이 만료를 직접 계산하면 판정이 두 벌이 되고 기기 시계에 휘둘린다.
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { C, FRAME_MAX_WIDTH, FS, FW, R, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import { useGo } from "@/farmfi/ui";
import { apiFetch, describeApiError } from "@/lib/api";
import { credentialNoFrom } from "@/farmfi/credential-qr";
import { QrScanner } from "@/farmfi/qr-scanner";

const BOX = 343;

type CredentialCheck = { valid: boolean; status: string; reason?: string; action?: string };
type CredentialResponse = {
  credential: { credentialNo: string; operatorName: string; expiresAt: string } | null;
  check: CredentialCheck;
};

type Stage =
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "approved"; operatorName: string; credentialNo: string }
  | { kind: "rejected"; reason: string; action?: string };

export default function ScanScreen() {
  const go = useGo();
  const [stage, setStage] = useState<Stage>({ kind: "scanning" });
  const [manual, setManual] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 카메라는 프레임마다 콜백을 때린다. 한 번 읽으면 잠근다.
  const locked = useRef(false);

  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [sweep]);
  const lineStyle = useAnimatedStyle(() => ({ top: sweep.value * (BOX - 2) }));

  async function verify(rawValue: string) {
    const scanned = credentialNoFrom(rawValue);
    if (!scanned) {
      setError("보증서 번호를 읽지 못했습니다. 번호를 직접 입력해 주세요.");
      locked.current = false;
      return;
    }

    setError(null);
    setStage({ kind: "checking" });
    try {
      const res = await apiFetch<CredentialResponse>("/api/operator/credential");
      if (!res.credential) {
        setStage({
          kind: "rejected",
          reason: "발급된 보증서가 없습니다.",
          action: "관리자에게 보증서 발급을 요청해 주세요.",
        });
        return;
      }
      if (res.credential.credentialNo !== scanned) {
        setStage({
          kind: "rejected",
          reason: "내 보증서와 번호가 다릅니다.",
          action: `읽은 번호 ${scanned}`,
        });
        return;
      }
      if (!res.check.valid) {
        setStage({
          kind: "rejected",
          reason: res.check.reason ?? "사용할 수 없는 보증서입니다.",
          action: res.check.action,
        });
        return;
      }
      setStage({
        kind: "approved",
        operatorName: res.credential.operatorName,
        credentialNo: res.credential.credentialNo,
      });
    } catch (e) {
      setError(describeApiError(e, "보증서를 확인하지 못했습니다."));
      setStage({ kind: "scanning" });
      locked.current = false;
    }
  }

  if (stage.kind === "approved") {
    return (
      <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
        <View style={[s.frame, s.approvedFrame]}>
          <View style={s.approvedIcon}>
            <AppIcon name="check" size={44} color={C.paper} />
          </View>
          <Text style={s.approvedText}>확인 완료</Text>
          <Text style={s.approvedSub}>
            {stage.operatorName} · {stage.credentialNo}
          </Text>
          <Pressable onPress={() => go.replace("/store-select")} hitSlop={10}>
            <Text style={s.approvedNext}>매장 선택으로 →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (stage.kind === "rejected") {
    return (
      <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
        <View style={[s.frame, s.approvedFrame]}>
          <View style={[s.approvedIcon, s.rejectedIcon]}>
            <AppIcon name="x" size={44} color={C.paper} />
          </View>
          <Text style={s.approvedText}>확인 실패</Text>
          <Text style={s.approvedSub}>{stage.reason}</Text>
          {stage.action && <Text style={s.rejectedAction}>{stage.action}</Text>}
          <Pressable
            onPress={() => {
              locked.current = false;
              setStage({ kind: "scanning" });
            }}
            hitSlop={10}
          >
            <Text style={s.approvedNext}>다시 스캔</Text>
          </Pressable>
          <Pressable onPress={() => go.replace("/store-select")} hitSlop={8}>
            <Text style={s.skip}>나중에 하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const checking = stage.kind === "checking";

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <View style={s.frame}>
        {/* 스캔은 로그인 없이 열리는 화면이라 닫으면 시작 화면으로 돌아간다. */}
        <Pressable onPress={() => go.back("/")} hitSlop={12} style={s.close}>
          <AppIcon name="x" size={22} color={C.paper} />
        </Pressable>

        <View style={s.copy}>
          <Text style={s.title}>QR을 스캔해주세요.</Text>
          <Text style={s.hint}>FarmFi 웹 &gt; 보증서 &gt; 운영자 보증서</Text>
        </View>

        <View style={[s.box, checking && s.boxDetected]}>
          {/* 스캐너는 계속 켜 둔다. 대조 중이라고 언마운트하면 카메라가 꺼졌다
              켜지며 깜빡이고, 대조에 실패해 돌아올 때마다 다시 연다. */}
          <QrScanner
            active={!checking}
            onScan={(data) => {
              if (locked.current) return;
              locked.current = true;
              void verify(data);
            }}
            onUnavailable={(reason) => {
              setError(reason);
              setManualOpen(true);
            }}
          />
          {checking ? (
            <View style={s.boxIdle}>
              <Text style={s.boxIdleText}>확인하는 중</Text>
            </View>
          ) : (
            <Animated.View style={[s.line, lineStyle]} pointerEvents="none" />
          )}
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        {manualOpen ? (
          <View style={s.manualBox}>
            <TextInput
              style={s.input}
              value={manual}
              onChangeText={setManual}
              placeholder="보증서 번호"
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!checking}
            />
            <Pressable
              style={[s.primary, (!manual.trim() || checking) && s.primaryOff]}
              disabled={!manual.trim() || checking}
              onPress={() => void verify(manual)}
            >
              <Text style={s.primaryText}>번호로 확인</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setManualOpen(true)} hitSlop={8}>
            <Text style={s.manualLink}>번호로 직접 입력</Text>
          </Pressable>
        )}

        <Text style={s.caption}>
          {checking ? "보증서를 확인하는 중입니다" : "스캔 영역에 QR을 맞춰주세요"}
        </Text>

        {/* 막다른 길을 만들지 않는다. 보증서가 아직 없거나 카메라를 못 쓰는 사람도
            매장 화면까지는 간다 — 거기서 운영 데이터는 서버 권한이 다시 막는다. */}
        <Pressable onPress={() => go.replace("/store-select")} hitSlop={8}>
          <Text style={s.skip}>나중에 하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: C.ink },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.lg,
    paddingHorizontal: SP.lg,
  },
  close: { position: "absolute", top: SP.lg, right: SP.lg, padding: SP.sm },

  copy: { alignItems: "center", gap: SP.sm },
  title: { fontSize: FS.hero, fontWeight: FW.bold, color: C.paper },
  hint: { fontSize: FS.body, color: C.paper, opacity: 0.6 },

  box: {
    width: BOX,
    maxWidth: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 6,
    borderColor: "rgba(255,255,255,0.85)",
    overflow: "hidden",
  },
  boxDetected: { borderColor: C.brand },
  boxIdle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP.lg,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  boxIdleText: { fontSize: FS.body, color: C.paper, opacity: 0.7, textAlign: "center" },
  line: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: C.brand },

  caption: { fontSize: FS.cap, color: C.paper, opacity: 0.7 },
  error: { fontSize: FS.cap, color: C.danger, textAlign: "center" },

  primary: {
    height: 48,
    paddingHorizontal: SP.xl,
    borderRadius: R.md,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { fontSize: FS.md, fontWeight: FW.semibold, color: C.paper },

  skip: { fontSize: FS.cap, color: C.paper, opacity: 0.55, paddingVertical: SP.xs },
  manualLink: { fontSize: FS.body, color: C.paper, opacity: 0.75, paddingVertical: SP.xs },
  manualBox: { width: "100%", gap: SP.sm },
  input: {
    height: 48,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    paddingHorizontal: SP.md,
    color: C.paper,
    fontSize: FS.md,
  },

  approvedFrame: { gap: SP.md },
  approvedIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectedIcon: { borderColor: C.danger },
  approvedText: { fontSize: FS.hero, fontWeight: FW.bold, color: C.paper },
  approvedSub: { fontSize: FS.body, color: C.paper, opacity: 0.75, textAlign: "center" },
  rejectedAction: { fontSize: FS.cap, color: C.paper, opacity: 0.6, textAlign: "center" },
  approvedNext: { fontSize: FS.body, color: C.paper, opacity: 0.75, paddingVertical: SP.sm },
});
