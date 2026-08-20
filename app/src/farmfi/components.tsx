// 픽셀 에셋을 쓰는 시각 요소.
// Figma가 "이미지 준비 중" · "Bed thumb (교체)" · "SceneCard"로 비워둔 자리를
// 이 컴포넌트들이 채운다. 껍데기·탭·상태 표시는 `ui/`가 맡는다.
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { CROP_CELL, LEAFY_SLOTS, TOMATO_SLOTS, type CropKind } from "./data";
import { CROP_PLANT, CROP_SPRITE, RACK_BASE } from "./assets";

// ─── 작물 스프라이트 크롭 (3열×2행에서 한 칸을 잘라 쓴다) ───
const CROP_SIZE = { tiny: 23, small: 31, medium: 40, large: 54 } as const;

export function CropPixel({
  kind,
  size = "medium",
}: {
  kind: CropKind;
  size?: keyof typeof CROP_SIZE;
}) {
  const px = CROP_SIZE[size];
  const cell = CROP_CELL[kind];
  return (
    <View style={{ width: px, height: px, overflow: "hidden" }}>
      <Image
        source={CROP_SPRITE}
        style={{
          width: px * 3,
          height: px * 2,
          transform: [{ translateX: -cell.col * px }, { translateY: -cell.row * px }],
        }}
        contentFit="fill"
      />
    </View>
  );
}

// ─── 재배 베드 식물 (sway 애니메이션) ───
function RackPlant({
  kind,
  index,
  maturity,
  scaleMul = 1,
}: {
  kind: CropKind;
  index: number;
  maturity: number;
  scaleMul?: number;
}) {
  const isTomato = kind === "tomato";
  const slots = isTomato ? TOMATO_SLOTS : LEAFY_SLOTS;
  const slot = slots[index];
  const asset = CROP_PLANT[kind];
  const stageScale = kind === "butter" ? 0.95 : kind === "romaine" ? 0.87 : kind === "basil" ? 0.84 : 0.9;
  const maturityScale = 0.86 + (maturity / 100) * 0.14;
  const plantScale = stageScale * maturityScale * (0.96 + (index % 3) * 0.025);
  const baseW = isTomato ? 80 : 52;
  const baseH = isTomato ? 112 : 58;
  const transY = isTomato ? 9 : 5;

  const rot = useSharedValue(isTomato ? -0.8 : -1.1);
  useEffect(() => {
    const to = isTomato ? 0.9 : 1.25;
    const from = isTomato ? -0.8 : -1.1;
    const dur = (isTomato ? 4400 : 3800) / 2;
    rot.value = withRepeat(
      withSequence(
        withTiming(to, { duration: dur, easing: Easing.inOut(Easing.ease) }),
        withTiming(from, { duration: dur, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [isTomato, rot]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: transY }, { scale: plantScale * scaleMul }, { rotateZ: `${rot.value}deg` }],
  }));

  return (
    <View
      style={{
        position: "absolute",
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        width: baseW,
        height: baseH,
        marginLeft: -baseW / 2,
        marginTop: -baseH,
      }}
      pointerEvents="none"
    >
      <Animated.View style={[{ width: "100%", height: "100%", transformOrigin: "50% 100%" }, aStyle]}>
        <Image
          source={asset.src}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          contentPosition="bottom"
        />
      </Animated.View>
    </View>
  );
}

// 베드 장면 — 작물 종류와 성숙도는 호출자가 API에서 받아 넘긴다.
export function GrowthRackScene({
  kind,
  maturity,
  compact = false,
}: {
  kind: CropKind;
  maturity: number;
  compact?: boolean;
}) {
  const isTomato = kind === "tomato";
  const slots = isTomato ? TOMATO_SLOTS : LEAFY_SLOTS;
  // compact(썸네일)은 슬롯 위치는 유지하고 각 식물만 개별 축소한다.
  const scaleMul = compact ? (isTomato ? 0.5 : 0.48) : 1;
  return (
    <View style={styles.rackScene}>
      <Image source={isTomato ? RACK_BASE.tomato : RACK_BASE.leafy} style={styles.rackBase} contentFit="cover" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {slots.map((_, i) => (
          <RackPlant kind={kind} index={i} maturity={maturity} scaleMul={scaleMul} key={`${kind}-${i}`} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rackScene: { width: "100%", height: "100%", overflow: "hidden", backgroundColor: "#F2F2F0" },
  rackBase: { width: "100%", height: "100%" },
});
