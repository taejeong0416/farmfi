// 00 로그인
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { C, FRAME_MAX_WIDTH, FS, FW, SP } from "@/farmfi/theme";
import { PrimaryButton, RoundField } from "@/farmfi/ui";

// 데모 계정. 우회 로그인이 아니라 이 자격으로 실제 세션을 발급받는다 —
// 운영 데이터 API가 operator 세션을 요구하므로 세션 없이는 화면이 빈다.
const DEMO_ACCOUNT = { email: "operator@farmfi.test", password: "farmfi123" };

export default function LoginScreen() {
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
  demo: { fontSize: FS.cap, color: C.body, textAlign: "center", paddingVertical: SP.sm },
});
