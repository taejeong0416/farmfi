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

// 식물 PNG는 아래쪽에 투명 여백을 달고 있다(알파 바운딩박스 실측, 2026-08-24).
// contentFit="contain" + contentPosition="bottom"은 **이미지 박스**의 바닥을 맞추지
// **그림 속 식물**의 밑동을 맞추지 않는다. 그 차이만큼 식물이 구멍 위로 뜬다.
const PLANT_BOTTOM_PAD: Record<CropKind, number> = {
  butter: 0.071,
  romaine: 0.073,
  basil: 0.081,
  tomato: 0.1,
};

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

  // contain이 만드는 실제 렌더 높이. 여기에 투명 여백 비율을 곱하면 밑동이 박스
  // 바닥에서 얼마나 떠 있는지가 px로 나온다.
  const fit = Math.min(baseW / asset.w, baseH / asset.h);
  const renderedH = fit * asset.h;
  // 축소는 밑동(transformOrigin 50% 100%) 기준이라 그 간격도 같은 비율로 줄어든다.
  // 그래서 내려야 할 거리에 최종 배율을 곱한다. 안 곱하면 썸네일에서 과하게 박힌다.
  const totalScale = plantScale * scaleMul;
  const transY = renderedH * PLANT_BOTTOM_PAD[kind] * totalScale;

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
    transform: [{ translateY: transY }, { scale: totalScale }, { rotateZ: `${rot.value}deg` }],
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
      {/* fill이어야 슬롯 %가 맞는다. cover는 컨테이너 비율이 이미지(3:2)와 다르면
          세로를 잘라내는데, 슬롯 좌표는 잘리기 전 기준이라 행마다 어긋난다.
          호출부가 aspectRatio 3/2를 지키면 fill이어도 늘어나지 않는다. */}
      <Image source={isTomato ? RACK_BASE.tomato : RACK_BASE.leafy} style={styles.rackBase} contentFit="fill" />
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
