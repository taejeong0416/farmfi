// 운영 앱 공용 UI 키트 — 기능명세서(2026-08-13)의 상세/입력/팝업 화면이 공유하는 조각들.
// components.tsx 는 탭 5개(원본 픽셀 이식분) 전용이라 그대로 두고, 이후 추가 화면은 여기 것을 쓴다.
import { useEffect, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { C, FRAME_MAX_WIDTH, SEVERITY, type Severity } from "./theme";
import { AppIcon, PixelGlyph, type IconName, type PixelGlyphName } from "./icons";
import { PIXEL_ICON, type PixelIconName } from "./assets";
import { TapScale } from "./components";

// ─── 상세 화면 셸 (탭 화면과 달리 하단 네비 없이 뒤로가기 헤더) ───
export function DetailShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [enter]);
  const aStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 10 }],
  }));

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <Animated.View style={[s.frame, aStyle]}>
        <View style={s.detailHeader}>
          <Pressable
            style={s.backBtn}
            hitSlop={10}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/farm/store"))}
          >
            <Text style={s.backChevron}>‹</Text>
          </Pressable>
          <View style={s.detailHeaderCopy}>
            <Text style={s.detailTitle} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={s.detailSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {action ?? <View style={s.backBtn} />}
        </View>
        <ScrollView contentContainerStyle={s.detailContent} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── 데모 배지 ───
// demoData.ts 를 쓰는 화면은 이걸 반드시 띄운다. 백엔드가 없는 화면이 실데이터인 척
// 하면 시연 중 잘못된 판단을 부르고, 그게 data.ts 가 목데이터를 거부하는 이유다.
export function DemoBadge({ note }: { note?: string }) {
  return (
    <View style={s.demo}>
      <PixelIcon name="ui-warning" size={20} />
      <Text style={s.demoText}>
        데모 데이터{note ? ` · ${note}` : ""} — 실제 운영 수치가 아닙니다
      </Text>
    </View>
  );
}

// ─── 픽셀 아이콘 (비트맵) ───
// 픽셀아트라 확대·축소 시 보간이 걸리면 뭉개진다. contentFit="contain" 으로 비율만 맞춘다.
export function PixelIcon({ name, size = 24 }: { name: PixelIconName; size?: number }) {
  return <Image source={PIXEL_ICON[name]} style={{ width: size, height: size }} contentFit="contain" />;
}

// ─── 카드 ───
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[s.card, padded && s.cardPadded, style]}>{children}</View>;
}

export function CardTitle({ icon, pixel, children, right }: { icon?: IconName; pixel?: PixelGlyphName; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.cardTitleRow}>
      {pixel ? <PixelGlyph name={pixel} size={20} /> : icon ? <AppIcon name={icon} size={19} color={C.green} /> : null}
      <Text style={s.cardTitleText}>{children}</Text>
      {right ? <View style={s.cardTitleRight}>{right}</View> : null}
    </View>
  );
}

// ─── 배지 (심각도 / 임의 색) ───
export function Badge({ severity, label, tone }: { severity?: Severity; label?: string; tone?: { fg: string; bg: string } }) {
  const spec = tone ?? (severity ? SEVERITY[severity] : SEVERITY.normal);
  const text = label ?? (severity ? SEVERITY[severity].label : "");
  return (
    <View style={[s.badge, { backgroundColor: spec.bg }]}>
      <Text style={[s.badgeText, { color: spec.fg }]}>{text}</Text>
    </View>
  );
}

// ─── 진행 막대 (재고 수량비 / 판매 순위 공통) ───
export function ProgressBar({ value, tone = C.green }: { value: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={s.bar}>
      <View style={[s.barFill, { width: `${clamped}%`, backgroundColor: tone }]} />
    </View>
  );
}

// ─── 라벨/값 한 줄 ───
export function KeyValueRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={[s.kvValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

// ─── 목록 행 (좌 아이콘 / 본문 / 우 값 / 셰브런) ───
export function ListRow({
  leading,
  title,
  caption,
  trailing,
  onPress,
  chevron = true,
}: {
  leading?: ReactNode;
  title: string;
  caption?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <>
      {leading ? <View style={s.listLeading}>{leading}</View> : null}
      <View style={s.listCopy}>
        <Text style={s.listTitle} numberOfLines={1}>{title}</Text>
        {caption ? <Text style={s.listCaption} numberOfLines={2}>{caption}</Text> : null}
      </View>
      {trailing}
      {chevron && onPress ? <Text style={s.listChevron}>›</Text> : null}
    </>
  );
  if (!onPress) return <View style={s.listRow}>{body}</View>;
  return (
    <TapScale style={s.listRow} scaleTo={0.99} onPress={onPress}>
      {body}
    </TapScale>
  );
}

// ─── 센서값 타일 (온·습·CO₂·EC) ───
export function SensorTile({
  label,
  value,
  unit,
  state = "normal",
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  state?: Severity;
  icon?: PixelIconName;
}) {
  const spec = SEVERITY[state];
  return (
    <View style={[s.sensorTile, state !== "normal" && { borderColor: spec.fg, backgroundColor: spec.bg }]}>
      <View style={s.sensorLabelRow}>
        {icon ? <PixelIcon name={icon} size={20} /> : null}
        <Text style={s.sensorLabel}>{label}</Text>
      </View>
      <Text style={[s.sensorValue, { color: spec.fg }]}>
        {value}
        <Text style={s.sensorUnit}>{unit}</Text>
      </Text>
    </View>
  );
}

// ─── 세그먼트 탭 (기간 필터 / 베드 선택) ───
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={s.segments}>
      {options.map((opt, i) => {
        const on = opt.key === value;
        return (
          <Text
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[
              s.segment,
              i === 0 && s.segmentFirst,
              i === options.length - 1 && s.segmentLast,
              i > 0 && s.segmentNoLeft,
              on && s.segmentActive,
            ]}
          >
            {opt.label}
          </Text>
        );
      })}
    </View>
  );
}

// ─── 입력 필드 ───
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  required,
  error,
  suffix,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  required?: boolean;
  error?: string | null;
  suffix?: string;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>
        {label}
        {required ? <Text style={s.fieldRequired}> *</Text> : null}
      </Text>
      <View style={[s.fieldBox, !!error && s.fieldBoxError, multiline && s.fieldBoxMultiline]}>
        <TextInput
          style={[s.fieldInput, multiline && s.fieldInputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#a5a89f"
          keyboardType={keyboardType}
          multiline={multiline}
        />
        {suffix ? <Text style={s.fieldSuffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}

// ─── 토글 (알림 수신 설정) ───
export function Toggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <Pressable style={[s.toggle, on && s.toggleOn]} onPress={() => onChange(!on)} hitSlop={6}>
      <View style={[s.toggleKnob, on && s.toggleKnobOn]} />
    </Pressable>
  );
}

// ─── 버튼 ───
export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <TapScale style={[s.primaryBtn, disabled && s.btnDisabled]} scaleTo={0.98} onPress={disabled ? undefined : onPress}>
      {icon ? <AppIcon name={icon} size={21} color="#fff" /> : null}
      <Text style={s.primaryBtnText}>{label}</Text>
    </TapScale>
  );
}

export function GhostButton({ label, onPress, icon }: { label: string; onPress?: () => void; icon?: IconName }) {
  return (
    <TapScale style={s.ghostBtn} scaleTo={0.98} onPress={onPress}>
      {icon ? <AppIcon name={icon} size={20} color={C.green} /> : null}
      <Text style={s.ghostBtnText}>{label}</Text>
    </TapScale>
  );
}

// ─── 팝업 (제어 결과 / 재고 부족 / 로그아웃 확인) ───
export function Popup({
  visible,
  severity = "normal",
  title,
  message,
  confirmLabel = "확인",
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  severity?: Severity;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const spec = SEVERITY[severity];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel ?? onConfirm}>
      <View style={s.popupBackdrop}>
        <View style={s.popupSheet}>
          <View style={[s.popupIcon, { backgroundColor: spec.bg }]}>
            {severity === "normal" ? (
              <AppIcon name="check" size={26} color={spec.fg} />
            ) : (
              <PixelIcon name="ui-warning" size={30} />
            )}
          </View>
          <Text style={s.popupTitle}>{title}</Text>
          {message ? <Text style={s.popupMessage}>{message}</Text> : null}
          <View style={s.popupActions}>
            {cancelLabel ? (
              <Pressable style={[s.popupBtn, s.popupBtnGhost]} onPress={onCancel}>
                <Text style={s.popupBtnGhostText}>{cancelLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable style={[s.popupBtn, { backgroundColor: spec.fg }]} onPress={onConfirm}>
              <Text style={s.popupBtnText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── 라인 차트 (센서 이력 / 기간별 추이) ───
// SalesScreen 은 자체 차트를 갖고 있고, 이후 추가 화면은 이 공용 차트를 쓴다.
export function LineChart({
  values,
  labels,
  unit = "",
  band,
  height = 150,
}: {
  values: number[];
  labels: string[];
  unit?: string;
  band?: { min: number; max: number };
  height?: number;
}) {
  const width = 320;
  const padX = 38;
  const padY = 14;
  const lo = Math.min(...values, band?.min ?? Infinity);
  const hi = Math.max(...values, band?.max ?? -Infinity);
  const span = hi - lo || 1;
  // 위아래로 8% 여백을 둬야 꼭짓점이 축선에 붙지 않는다.
  const min = lo - span * 0.08;
  const max = hi + span * 0.08;
  const toY = (v: number) => height - padY - ((v - min) / (max - min)) * (height - padY * 2);
  const toX = (i: number) => padX + (i / Math.max(1, values.length - 1)) * (width - padX - 8);

  const points = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const ticks = [max, (max + min) / 2, min];

  return (
    <View>
      <Svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {band ? (
          <Rect
            x={padX}
            y={toY(band.max)}
            width={width - padX - 8}
            height={Math.max(0, toY(band.min) - toY(band.max))}
            fill={C.greenSoft}
          />
        ) : null}
        {ticks.map((v, i) => (
          <Line
            key={i}
            x1={padX}
            x2={width - 8}
            y1={toY(v)}
            y2={toY(v)}
            stroke="#dadbd7"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        ))}
        {ticks.map((v, i) => (
          <SvgText key={`t${i}`} x={2} y={toY(v) + 3} fill="#636660" fontSize={8}>
            {`${Math.round(v * 10) / 10}${unit}`}
          </SvgText>
        ))}
        <Polyline points={points} fill="none" stroke={C.green} strokeWidth={2.1} strokeLinejoin="round" />
      </Svg>
      <View style={s.chartLabels}>
        {labels.map((l) => (
          <Text key={l} style={s.chartLabel}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

// ─── 빈 상태 (명세서 곳곳의 "빈 상태를 표시한다") ───
export function EmptyState({
  pixel = "sprout",
  icon,
  title,
  caption,
}: {
  pixel?: PixelGlyphName;
  icon?: PixelIconName;
  title: string;
  caption?: string;
}) {
  return (
    <View style={s.empty}>
      {icon ? <PixelIcon name={icon} size={52} /> : <PixelGlyph name={pixel} size={44} />}
      <Text style={s.emptyTitle}>{title}</Text>
      {caption ? <Text style={s.emptyCaption}>{caption}</Text> : null}
    </View>
  );
}

// ─── 이력 타임라인 한 칸 (생육 기록 / 재고 입출고) ───
export function TimelineRow({
  time,
  title,
  caption,
  tone = C.green,
  last,
}: {
  time: string;
  title: string;
  caption?: string;
  tone?: string;
  last?: boolean;
}) {
  return (
    <View style={s.timelineRow}>
      <View style={s.timelineRail}>
        <View style={[s.timelineDot, { borderColor: tone }]} />
        {!last ? <View style={s.timelineLine} /> : null}
      </View>
      <View style={s.timelineCopy}>
        <Text style={s.timelineTime}>{time}</Text>
        <Text style={s.timelineTitle}>{title}</Text>
        {caption ? <Text style={s.timelineCaption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: C.stageBg },
  frame: { flex: 1, width: "100%", maxWidth: FRAME_MAX_WIDTH, alignSelf: "center", backgroundColor: C.paper },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: "#eae5dc",
    paddingHorizontal: 12,
  },
  backBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  backChevron: { fontSize: 33, fontWeight: "300", color: C.ink, marginTop: -4 },
  detailHeaderCopy: { flex: 1 },
  detailTitle: { fontSize: 17, letterSpacing: -0.6, color: C.ink, fontWeight: "700" },
  detailSubtitle: { marginTop: 2, fontSize: 11, color: C.muted },
  detailContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 10 },

  card: { borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: "#fff" },
  cardPadded: { paddingHorizontal: 13, paddingTop: 13, paddingBottom: 12 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  cardTitleText: { flex: 1, fontSize: 16, letterSpacing: -0.4, color: C.ink, fontWeight: "600" },
  cardTitleRight: { marginLeft: "auto" },

  badge: { alignSelf: "flex-start", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: "700" },

  bar: { flex: 1, height: 7, borderRadius: 99, backgroundColor: "#f0eeea", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99 },

  kvRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34 },
  kvLabel: { fontSize: 12, color: C.muted },
  kvValue: { fontSize: 13, color: C.ink, fontWeight: "600" },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: "#efeae2",
    paddingVertical: 9,
  },
  listLeading: { width: 30, alignItems: "center" },
  listCopy: { flex: 1, gap: 3 },
  listTitle: { fontSize: 13, color: C.ink, fontWeight: "600" },
  listCaption: { fontSize: 11, color: C.muted, lineHeight: 15 },
  listChevron: { fontSize: 26, fontWeight: "300", color: "#9b9a94" },

  sensorTile: {
    flex: 1,
    minHeight: 74,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: C.cardLine,
    borderRadius: 9,
    backgroundColor: "#fff",
    paddingHorizontal: 4,
  },
  sensorLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  sensorLabel: { fontSize: 10, fontWeight: "600", color: "#4b4e49" },
  sensorValue: { fontSize: 20, letterSpacing: -0.8, fontWeight: "700" },
  sensorUnit: { fontSize: 10, fontWeight: "500", color: "#151715" },

  segments: { flexDirection: "row" },
  segment: {
    flex: 1,
    height: 38,
    lineHeight: 38,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#d6cec2",
    backgroundColor: "#fff",
    fontSize: 12,
    color: C.ink,
  },
  segmentFirst: { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  segmentLast: { borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  segmentNoLeft: { borderLeftWidth: 0 },
  segmentActive: { borderColor: C.green, backgroundColor: C.green, color: "#fff", fontWeight: "700" },

  field: { gap: 6 },
  fieldLabel: { fontSize: 12, color: "#3c3f3a", fontWeight: "600" },
  fieldRequired: { color: C.danger },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
  },
  fieldBoxError: { borderColor: C.danger },
  fieldBoxMultiline: { minHeight: 88, alignItems: "flex-start", paddingVertical: 10 },
  fieldInput: { flex: 1, fontSize: 14, color: C.ink, paddingVertical: 0 },
  fieldInputMultiline: { minHeight: 68, textAlignVertical: "top" },
  fieldSuffix: { fontSize: 12, color: C.muted },
  fieldError: { fontSize: 11, color: C.danger },

  toggle: {
    width: 46,
    height: 27,
    borderRadius: 99,
    backgroundColor: "#d8d3c9",
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: C.green },
  toggleKnob: { width: 21, height: 21, borderRadius: 99, backgroundColor: "#fff" },
  toggleKnobOn: { alignSelf: "flex-end" },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: C.green,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.45 },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    borderWidth: 1.4,
    borderColor: C.green,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  ghostBtnText: { color: C.green, fontSize: 14, fontWeight: "700" },

  popupBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.32)", alignItems: "center", justifyContent: "center", padding: 34 },
  popupSheet: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: C.paper,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  popupIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 99 },
  popupTitle: { marginTop: 13, fontSize: 17, letterSpacing: -0.5, color: C.ink, fontWeight: "700", textAlign: "center" },
  popupMessage: { marginTop: 7, fontSize: 12, lineHeight: 18, color: "#4d504b", textAlign: "center" },
  popupActions: { flexDirection: "row", gap: 8, alignSelf: "stretch", marginTop: 18 },
  popupBtn: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  popupBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  popupBtnGhost: { borderWidth: 1, borderColor: "#cfc7ba", backgroundColor: "#fff" },
  popupBtnGhostText: { color: "#4d504b", fontSize: 14, fontWeight: "600" },

  empty: { alignItems: "center", gap: 8, paddingVertical: 38 },
  emptyTitle: { marginTop: 4, fontSize: 14, color: C.ink, fontWeight: "600" },
  emptyCaption: { fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 16 },

  timelineRow: { flexDirection: "row", gap: 10 },
  timelineRail: { width: 14, alignItems: "center" },
  timelineDot: { width: 11, height: 11, borderRadius: 99, borderWidth: 2.5, backgroundColor: "#fff", marginTop: 4 },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: "#e4dfd7", marginVertical: 3 },
  timelineCopy: { flex: 1, paddingBottom: 15, gap: 3 },
  timelineTime: { fontSize: 10, color: C.muted },
  timelineTitle: { fontSize: 13, color: C.ink, fontWeight: "600" },
  timelineCaption: { fontSize: 11, color: "#5c5f59", lineHeight: 16 },

  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -2, marginLeft: 37, marginRight: 3 },
  chartLabel: { color: "#5f625d", fontSize: 9 },

  demo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2cfa8",
    borderRadius: 8,
    backgroundColor: C.warnSoft,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  demoText: { flex: 1, fontSize: 11, lineHeight: 15, color: "#7a5a1e", fontWeight: "600" },
});

export { s as uiStyles };
