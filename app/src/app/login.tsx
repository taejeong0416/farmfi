// 00 로그인
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocalSearchParams } from "expo-router";

import { useAuth } from "@/lib/auth";
import { C, FRAME_MAX_WIDTH, FS, FW, SP } from "@/farmfi/theme";
import { PrimaryButton, RoundField, useGo } from "@/farmfi/ui";

import { SESSION_ACCOUNT as DEMO_ACCOUNT } from "@/lib/session-account";

export default function LoginScreen() {
  const go = useGo();
  // 시안에서 이 화면은 흐름에 없다(00 로그인 frame hidden). 스플래시가 세션을
  // 발급받고, 그게 실패했을 때만 여기로 온다 — 그때는 `?e=session`이 붙는다.
  //
  // 표식 없이 들어왔다는 건 주소창 자동완성이나 옛 북마크로 왔다는 뜻이다.
  // 그대로 두면 사용자는 없어진 화면에 갇힌다. 스플래시로 되돌린다.
  const params = useLocalSearchParams<{ e?: string }>();
  const strayEntry = params.e !== "session";
  useEffect(() => {
    if (strayEntry) go.replace("/");
  }, [strayEntry, go]);
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (id: string, pw: string) => {
    setError(null);
    setBusy(true);
    try {
      await login(id.trim(), pw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onDemo = () => {
    setEmail(DEMO_ACCOUNT.email);
    setPassword(DEMO_ACCOUNT.password);
    return submit(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
  };

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.frame}
      >
        <View style={s.logoBlock}>
          <Text style={s.logo}>FarmFi</Text>
          <Text style={s.tagline}>도심 스마트팜 운영지원 서비스</Text>
        </View>

        <View style={s.form}>
          <RoundField
            icon="mail"
            placeholder="이메일"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />
          <RoundField
            icon="lock"
            placeholder="비밀번호"
            value={password}
            onChangeText={setPassword}
            secure
          />

          {error && <Text style={s.error}>{error}</Text>}

          <PrimaryButton
            label={busy ? "확인 중…" : "로그인"}
            onPress={() => submit(email, password)}
            disabled={busy}
            style={s.submit}
          />

          <Pressable onPress={onDemo} disabled={busy} hitSlop={8}>
            <Text style={s.demo}>데모 계정으로 바로 들어가기</Text>
          </Pressable>

          {/* 보증서 확인(M-02) 입구. 스플래시에도 같은 버튼이 있지만 그 화면은 1.1초
              뒤 자동으로 넘어가서 누를 틈이 없다. 머무는 화면에도 길을 둔다. */}
          <Pressable onPress={() => go.push("/scan")} hitSlop={8}>
            <Text style={s.scanLink}>QR로 보증서 확인</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: C.paper },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 46,
    gap: SP.xxl,
  },
  logoBlock: { alignItems: "center", gap: SP.sm },
  logo: { fontSize: 38, fontWeight: FW.bold, color: C.brand, letterSpacing: -1 },
  tagline: { fontSize: FS.cap, color: C.body },
  form: { gap: SP.md },
  error: { fontSize: FS.cap, color: C.danger, textAlign: "center" },
  submit: { marginTop: SP.sm },
  scanLink: {
    fontSize: FS.body,
    color: C.body,
    textAlign: "center",
    paddingVertical: SP.xs,
  },
  demo: { fontSize: FS.cap, color: C.body, textAlign: "center", paddingVertical: SP.sm },
});
