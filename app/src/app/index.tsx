// Splash — 앱이 어디로 갈지 정하는 통과 지점.
// 세션이 있으면 보증서 확인으로, 없으면 로그인으로 넘긴다.
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useAuth } from "@/lib/auth";
import { SESSION_ACCOUNT } from "@/lib/session-account";
import { C, FRAME_MAX_WIDTH, FS, FW, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import { useGo } from "@/farmfi/ui";

// 로고를 보여주는 시간. 웹은 이 앞에 번들 로딩이 붙어 실제로는 더 짧게 스친다.
// 1.1초로는 화면을 봤다는 인상도, QR 버튼을 누를 틈도 남지 않아 2초로 늘렸다.
// 보증서 확인 입구는 로그인 화면에도 따로 두었다 — 여기만 두면 자동 이동에 먹힌다.
const HOLD_MS = 2000;

export default function SplashScreen() {
  const { user, loading, login } = useAuth();
  const go = useGo();

  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [fade]);
  const aStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // 로고를 잠깐 보여준 뒤 넘어간다. 세션 확인이 끝나기 전에는 기다린다.
  useEffect(() => {
    if (loading) return;
    // 시안에 로그인 화면이 숨겨져 있어(00 로그인 frame hidden) 흐름에서 뺐다.
    // 대신 세션이 없으면 여기서 조용히 발급받는다 — 운영 API가 전부 JWT를 요구해
    // 세션 없이는 어느 화면도 데이터를 못 그린다.
    // 발급이 실패했을 때만 로그인 화면을 띄운다. 막다른 길을 만들지 않는다.
    const t = setTimeout(async () => {
      if (user) {
        go.replace("/scan");
        return;
      }
      try {
        await login(SESSION_ACCOUNT.email, SESSION_ACCOUNT.password);
        go.replace("/scan");
      } catch {
        go.replace("/login");
      }
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [loading, user, go, login]);

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <View style={s.frame}>
        <Animated.View style={[s.center, aStyle]}>
          <Text style={s.logo}>FarmFi</Text>
          <Text style={s.tagline}>도심 속 신선한 내일을 심다</Text>
        </Animated.View>

        <Pressable style={s.qrButton} onPress={() => go.push("/scan")}>
          <AppIcon name="qr" size={18} color={C.paper} />
          <Text style={s.qrText}>QR로 바로 시작하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: C.brand },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: 46,
    paddingBottom: 56,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: SP.md },
  logo: { fontSize: 44, fontWeight: FW.bold, color: C.paper, letterSpacing: -1 },
  tagline: { fontSize: FS.cap, color: C.paper, opacity: 0.85 },
  qrButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    height: 45,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: C.paper,
  },
  qrText: { fontSize: FS.body, fontWeight: FW.semibold, color: C.paper },
});
