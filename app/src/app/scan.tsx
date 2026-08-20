// 00 scan — 시도 · 인식 성공 · 승인 완료 세 상태를 한 화면에서 넘긴다.
// 카메라 모듈(expo-camera)은 아직 의존성에 없다. 실제 프리뷰가 붙기 전까지는
// 스캔 영역을 누르면 다음 상태로 넘어간다.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

type Stage = "scanning" | "detected" | "approved";

const BOX = 343;

export default function ScanScreen() {
  const go = useGo();
  const [stage, setStage] = useState<Stage>("scanning");

  // 스캐너 선이 위아래로 움직인다.
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [sweep]);
  const lineStyle = useAnimatedStyle(() => ({ top: sweep.value * (BOX - 2) }));

  // 인식 성공은 잠깐 보여주고 승인 완료로 넘어간다.
  useEffect(() => {
    if (stage !== "detected") return;
    const t = setTimeout(() => setStage("approved"), 900);
    return () => clearTimeout(t);
  }, [stage]);

  if (stage === "approved") {
    return (
      <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
        <View style={[s.frame, s.approvedFrame]}>
          <View style={s.approvedIcon}>
            <AppIcon name="check" size={44} color={C.paper} />
          </View>
          <Text style={s.approvedText}>승인 완료</Text>
          <Pressable onPress={() => go.replace("/store-select")} hitSlop={10}>
            <Text style={s.approvedNext}>매장 선택으로 →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const detected = stage === "detected";

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <View style={s.frame}>
        <Pressable onPress={go.back} hitSlop={12} style={s.close}>
          <AppIcon name="x" size={22} color={C.paper} />
        </Pressable>

        <View style={s.copy}>
          <Text style={s.title}>QR을 스캔해주세요.</Text>
          <Text style={s.hint}>FarmFi 웹 &gt; 보증서 &gt; 운영자 보증서</Text>
        </View>

        <Pressable onPress={() => setStage("detected")}>
          <View style={[s.box, detected && s.boxDetected]}>
            {!detected && <Animated.View style={[s.line, lineStyle]} />}
          </View>
        </Pressable>

        <Text style={s.caption}>
          {detected ? "보증서를 확인하는 중입니다" : "스캔 영역에 QR을 맞춰주세요"}
        </Text>
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
    gap: SP.xl,
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
  line: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: C.brand },

  caption: { fontSize: FS.cap, color: C.paper, opacity: 0.7 },

  approvedFrame: { gap: SP.lg },
  approvedIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  approvedText: { fontSize: FS.hero, fontWeight: FW.bold, color: C.paper },
  approvedNext: { fontSize: FS.body, color: C.paper, opacity: 0.75, paddingVertical: SP.sm },
});
