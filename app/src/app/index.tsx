// Splash — 앱이 어디로 갈지 정하는 통과 지점.
// 세션이 있으면 매장 선택으로, 없으면 로그인으로 넘긴다.
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useAuth } from "@/lib/auth";
import { C, FRAME_MAX_WIDTH, FS, FW, SP } from "@/farmfi/theme";
import { AppIcon } from "@/farmfi/icons";
import { useGo } from "@/farmfi/ui";

const HOLD_MS = 1100;

export default function SplashScreen() {
  const { user, loading } = useAuth();
  const go = useGo();

  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [fade]);
  const aStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // 로고를 잠깐 보여준 뒤 넘어간다. 세션 확인이 끝나기 전에는 기다린다.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => go.replace(user ? "/store-select" : "/login"), HOLD_MS);
    return () => clearTimeout(t);
  }, [loading, user, go]);

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
