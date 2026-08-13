import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

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

  const onSubmit = () => submit(email, password);

  const onDemo = () => {
    setEmail(DEMO_ACCOUNT.email);
    setPassword(DEMO_ACCOUNT.password);
    return submit(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <Text style={styles.logo}>FarmFi</Text>
        <Text style={styles.subtitle}>도심 스마트팜 STO 플랫폼</Text>

        <TextInput
          style={styles.input}
          placeholder="이메일"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>로그인</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.demoButton, busy && styles.buttonDisabled]}
          onPress={onDemo}
          disabled={busy}
        >
          <Text style={styles.demoButtonText}>데모 계정으로 바로 들어가기</Text>
        </Pressable>

        <Text style={styles.hint}>
          운영자 계정 operator@farmfi.test 로 접속합니다{"\n"}
          비밀번호: farmfi123
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logo: { fontSize: 40, fontWeight: "800", color: "#16a34a", textAlign: "center" },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    color: "#111827",
  },
  error: { color: "#dc2626", fontSize: 14, marginBottom: 8 },
  button: {
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  demoButton: {
    borderWidth: 1.4,
    borderColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 10,
  },
  demoButtonText: { color: "#16a34a", fontSize: 15, fontWeight: "700" },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 24,
    lineHeight: 18,
  },
});
