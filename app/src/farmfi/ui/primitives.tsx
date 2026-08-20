// Figma `Internal Only Canvas`의 App/* 중 기본 요소.
// 색은 theme.ts 토큰으로만 쓴다 — 원본 hex를 여기 적지 않는다.
import { type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { C, FS, FW, R, SEVERITY, SP, type Severity } from "../theme";
import { AppIcon, type IconName } from "../icons";

// ─── 글자 ───
// Figma는 Regular / SemiBold / Bold 세 굵기와 11~24 크기만 쓴다.
type TypeVariant =
  | "hero" | "h1" | "h2" | "title" | "section" | "body" | "bodyStrong"
  | "label" | "caption" | "micro";

const TYPE: Record<TypeVariant, TextStyle> = {
  hero: { fontSize: FS.hero, fontWeight: FW.bold, color: C.ink },
  h1: { fontSize: FS.h1, fontWeight: FW.semibold, color: C.ink },
  h2: { fontSize: FS.h2, fontWeight: FW.bold, color: C.ink },
  title: { fontSize: FS.xl, fontWeight: FW.semibold, color: C.ink },
  section: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  body: { fontSize: FS.body, fontWeight: FW.regular, color: C.ink },
  bodyStrong: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },
  label: { fontSize: FS.md, fontWeight: FW.regular, color: C.body },
  caption: { fontSize: FS.sm, fontWeight: FW.regular, color: C.body },
  micro: { fontSize: FS.xs, fontWeight: FW.regular, color: C.muted },
};

export function T({
  v = "body",
  color,
  style,
  children,
  numberOfLines,
}: {
  v?: TypeVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text style={[TYPE[v], color ? { color } : null, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

// ─── 카드 ───
export function Card({
  style,
  children,
  onPress,
  selected = false,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  onPress?: () => void;
  selected?: boolean;
}) {
  const body = <View style={[s.card, selected && s.cardSelected, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? s.pressed : null)}>
      {body}
    </Pressable>
  );
}

// ─── 배지 ───
// 등급을 색으로 나누지 않는다. 배경은 surface 하나고, 위험만 글자색이 danger다.
export function Badge({ severity, label }: { severity: Severity; label?: string }) {
  const spec = SEVERITY[severity];
  return (
    <View style={[s.badge, { backgroundColor: spec.bg }]}>
      <Text style={[s.badgeText, { color: spec.fg }]}>{label ?? spec.label}</Text>
    </View>
  );
}

// ─── 알약(상태·필터 칩) ───
export function Pill({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.pill, active && { backgroundColor: C.brand, borderColor: C.brand }]}
    >
      <Text style={[s.pillText, active && { color: C.paper }]}>{label}</Text>
    </Pressable>
  );
}

// ─── 버튼 ───
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        s.primaryBtn,
        disabled && s.btnDisabled,
        pressed && !disabled && s.pressed,
        style,
      ]}
    >
      {icon && <AppIcon name={icon} size={18} color={C.paper} />}
      <Text style={s.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  disabled = false,
  icon,
  tone = "neutral",
  style,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: IconName;
  tone?: "neutral" | "brand" | "danger";
  style?: StyleProp<ViewStyle>;
}) {
  const base = tone === "brand" ? C.brand : tone === "danger" ? C.danger : C.body;
  const fg = disabled ? C.muted : base;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        s.ghostBtn,
        disabled && s.btnDisabled,
        pressed && !disabled && s.pressed,
        style,
      ]}
    >
      {icon && <AppIcon name={icon} size={18} color={fg} />}
      <Text style={[s.ghostBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

// ─── 입력 ───
export function Field({
  label,
  required = false,
  placeholder,
  value,
  onChangeText,
  suffix,
  hint,
  keyboardType = "default",
  multiline = false,
  editable = true,
}: {
  label?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChangeText?: (t: string) => void;
  suffix?: string;
  hint?: string;
  keyboardType?: "default" | "numeric" | "email-address";
  multiline?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={s.field}>
      {label && (
        <Text style={s.fieldLabel}>
          {label}
          {required && <Text style={{ color: C.brand }}> *</Text>}
        </Text>
      )}
      <View style={[s.fieldBox, multiline && s.fieldBoxTall, !editable && s.fieldBoxOff]}>
        <TextInput
          style={[s.fieldInput, multiline && s.fieldInputTall]}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={multiline}
          editable={editable}
        />
        {suffix && <Text style={s.fieldSuffix}>{suffix}</Text>}
      </View>
      {hint && <Text style={s.fieldHint}>{hint}</Text>}
    </View>
  );
}

// 아이콘이 앞에 붙는 둥근 입력 (로그인 화면)
export function RoundField({
  icon,
  placeholder,
  value,
  onChangeText,
  secure = false,
  keyboardType = "default",
}: {
  icon: IconName;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secure?: boolean;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={s.roundField}>
      <AppIcon name={icon} size={16} color={C.muted} />
      <TextInput
        style={s.roundFieldInput}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

// ─── 선택 ───
export function Toggle({ on, onChange }: { on: boolean; onChange?: (next: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange?.(!on)}
      style={[s.toggle, { backgroundColor: on ? C.brand : C.line }]}
    >
      <View style={[s.toggleKnob, on && { alignSelf: "flex-end" }]} />
    </Pressable>
  );
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange?: () => void }) {
  return (
    <Pressable onPress={onChange} style={[s.checkbox, checked && s.checkboxOn]} hitSlop={8}>
      {checked && <View style={s.checkboxTick} />}
    </Pressable>
  );
}

export function Radio({ selected, onChange }: { selected: boolean; onChange?: () => void }) {
  return (
    <Pressable
      onPress={onChange}
      style={[s.radio, selected && { borderColor: C.brand }]}
      hitSlop={8}
    >
      {selected && <View style={s.radioDot} />}
    </Pressable>
  );
}

// ─── 진행 막대 ───
export function ProgressBar({
  percent,
  height = 7,
  tone = "brand",
}: {
  percent: number;
  height?: number;
  tone?: "brand" | "muted";
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <View style={[s.progressTrack, { height, borderRadius: height }]}>
      <View
        style={{
          width: `${clamped}%`,
          height: "100%",
          borderRadius: height,
          backgroundColor: tone === "brand" ? C.brand : C.muted,
        }}
      />
    </View>
  );
}

// ─── 구분선 ───
export function Divider({ vertical = false }: { vertical?: boolean }) {
  return <View style={vertical ? s.dividerV : s.dividerH} />;
}

// ─── 로딩 뼈대 ───
export function SkeletonBlock({
  width = "100%",
  height = 20,
  radius = R.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ width, height, borderRadius: radius, backgroundColor: C.surface }, style]} />;
}

const s = StyleSheet.create({
  pressed: { opacity: 0.85 },

  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    padding: SP.md,
  },
  cardSelected: { borderWidth: 2, borderColor: C.brand },

  badge: {
    paddingHorizontal: SP.sm,
    height: 23,
    justifyContent: "center",
    borderRadius: R.sm,
  },
  badgeText: { fontSize: FS.sm, fontWeight: FW.semibold },

  pill: {
    height: 27,
    paddingHorizontal: SP.md,
    justifyContent: "center",
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
  },
  pillText: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.body },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    minHeight: 52,
    borderRadius: R.md,
    backgroundColor: C.brand,
    paddingHorizontal: SP.lg,
  },
  primaryBtnText: { fontSize: FS.body, fontWeight: FW.semibold, color: C.paper },
  btnDisabled: { backgroundColor: C.muted },

  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    minHeight: 44,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    paddingHorizontal: SP.lg,
  },
  ghostBtnText: { fontSize: FS.body, fontWeight: FW.semibold },

  field: { gap: SP.xs },
  fieldLabel: { fontSize: FS.lg, fontWeight: FW.regular, color: C.body },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    minHeight: 47,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
    paddingHorizontal: SP.md,
  },
  fieldBoxTall: { minHeight: 96, alignItems: "flex-start", paddingVertical: SP.md },
  fieldBoxOff: { backgroundColor: C.surface },
  fieldInput: { flex: 1, fontSize: FS.body, color: C.ink, paddingVertical: SP.sm },
  fieldInputTall: { textAlignVertical: "top", minHeight: 72 },
  fieldSuffix: { fontSize: FS.sm, color: C.body },
  fieldHint: { fontSize: FS.sm, color: C.muted },

  roundField: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    height: 45,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 36,
    backgroundColor: C.paper,
    paddingHorizontal: SP.lg,
  },
  roundFieldInput: { flex: 1, fontSize: FS.body, color: C.ink },

  toggle: {
    width: 47,
    height: 28,
    borderRadius: R.pill,
    padding: 3,
    justifyContent: "center",
  },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.paper },

  checkbox: {
    width: 18,
    height: 18,
    borderRadius: R.xs,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: C.brand, borderColor: C.brand },
  checkboxTick: {
    width: 8,
    height: 5,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: C.paper,
    transform: [{ rotate: "-45deg" }, { translateY: -1 }],
  },

  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand },

  progressTrack: { flex: 1, backgroundColor: C.surface, overflow: "hidden" },

  dividerH: { height: 1, backgroundColor: C.line },
  dividerV: { width: 1, alignSelf: "stretch", backgroundColor: C.line },
});
