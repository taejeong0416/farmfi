// 시안의 첫 두 화면을 한 파일에 담는다.
//
//   ① Splash (Figma 6:1820) — 로고만. 지나가는 화면이다.
//   ② 시작 (Figma 1:1009)   — 로고 + "QR로 바로 시작하기". **여기 머문다.**
//
// 둘을 합쳐 자동으로 넘겨버리면 ②에 머물 수가 없어 QR 버튼을 누를 틈이 없다.
// 실제로 그렇게 만들어놨다가 스캔 화면에 들어갈 길이 사라졌다.
//
// ① 구간에서 세션을 조용히 발급받는다. 시안에 로그인 화면이 숨겨져 있어
// (00 로그인 frame hidden) 흐름에서 뺐는데, 운영 API가 전부 JWT를 요구해
// 세션 없이는 어느 화면도 데이터를 못 그린다. 발급이 실패했을 때만 로그인
// 화면을 띄운다 — 막다른 길을 만들지 않는다.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useAuth } from "@/lib/auth";
import { SESSION_ACCOUNT } from "@/lib/session-account";
import { C, FRAME_MAX_WIDTH, FS, FW, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import { useGo } from "@/farmfi/ui";

/** 로고만 보여주는 구간. 세션 발급이 더 걸리면 그쪽을 기다린다. */
const SPLASH_MS = 1200;

export default function SplashScreen() {
  const { user, loading, login } = useAuth();
  const go = useGo();

  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [fade]);
  const aStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // ① 구간: 로고를 보여주면서 세션을 확보한다. 둘 다 끝나야 ②로 넘어간다.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (loading) return;
    let alive = true;

    const hold = new Promise((r) => setTimeout(r, SPLASH_MS));
    const session = user
      ? Promise.resolve(true)
      : login(SESSION_ACCOUNT.email, SESSION_ACCOUNT.password)
          .then(() => true)
          .catch(() => false);

    void Promise.all([hold, session]).then(([, ok]) => {
      if (!alive) return;
      if (ok) setStarted(true);
      else go.replace("/login");
    });

    return () => {
      alive = false;
    };
  }, [loading, user, go, login]);

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <View style={s.frame}>
        <Animated.View style={[s.center, aStyle]}>
          <Text style={s.logo}>FarmFi</Text>
          <Text style={s.tagline}>도심 속 신선한 내일을 심다</Text>
        </Animated.View>

        {/* ② 구간에서만 나온다. 시안 6:1820에는 이 버튼이 없다. */}
        {started ? (
          <Pressable style={s.qrButton} onPress={() => go.push("/scan")}>
            <AppIcon name="qr" size={18} color={C.paper} />
            <Text style={s.qrText}>QR로 바로 시작하기</Text>
          </Pressable>
        ) : null}
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
