// Figma `Internal Only Canvas`의 App/* 중 조합 요소 — 카드와 목록 행.
import { type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Image } from "expo-image";

import { C, FS, FW, R, SEVERITY, SP, type Severity } from "../theme";
import { AppIcon, type IconName } from "../icons";
import { CropPixel, GrowthRackScene } from "../components";
import { STORE_FLOOR_PLAN } from "../assets";
import { type CropKind } from "../data";
import { Badge, Card, Divider, GhostButton, ProgressBar, Toggle, T } from "./primitives";

// ─── 섹션 제목 ───
export function SectionTitle({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionText}>{children}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.sectionAction}>{action} ›</Text>
        </Pressable>
      )}
    </View>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text style={s.cardTitle}>{children}</Text>;
}

// ─── 지표 타일 ───
export function MetricTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={s.metricTile}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={s.metricValueRow}>
        <Text style={s.metricValue}>{value}</Text>
        {unit && <Text style={s.metricUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

// ─── 확인 완료 표시 ───
export function AckedMark({ label = "확인 완료" }: { label?: string }) {
  return (
    <View style={s.ackRow}>
      <View style={s.ackDot} />
      <Text style={s.ackText}>{label}</Text>
    </View>
  );
}

// ─── 설비 알림 카드 ───
export function AlertCard({
  severity,
  title,
  time,
  message,
  acked,
  onAck,
}: {
  severity: Severity;
  title: string;
  time: string;
  message: string;
  acked: boolean;
  onAck?: () => void;
}) {
  return (
    <Card style={s.alertCard}>
      <View style={s.alertHead}>
        <Badge severity={severity} />
        <Text style={s.alertTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.alertTime}>{time}</Text>
      </View>
      <Text style={s.alertMessage}>{message}</Text>
      {acked ? <AckedMark /> : <GhostButton label="확인 처리" onPress={onAck} />}
    </Card>
  );
}

// ─── 베드 카드 (재배 현황) ───
export function BedCard({
  bed,
  crop,
  cropKind,
  stage,
  severity,
  readings,
  deviceLabel,
  devicePercent,
  updatedAt,
  onPress,
}: {
  bed: string;
  crop: string;
  cropKind?: CropKind;
  stage: string;
  severity: Severity;
  readings: { label: string; value: string; alert?: boolean }[];
  deviceLabel: string;
  devicePercent: number;
  updatedAt: string;
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress} style={s.bedCard}>
      <View style={s.bedHead}>
        {/* Figma의 "Bed thumb (교체)" 자리 */}
        <View style={s.bedThumb}>
          {cropKind ? <CropPixel kind={cropKind} size="small" /> : <AppIcon name="leaf" size={22} color={C.brand} />}
        </View>
        <View style={s.bedCopy}>
          <Text style={s.bedName}>{bed}</Text>
          <Text style={s.bedSub}>
            {crop} · {stage}
          </Text>
        </View>
        <Badge severity={severity} />
      </View>

      <View style={s.bedReadings}>
        {readings.map((r) => (
          <View style={s.bedReading} key={r.label}>
            <Text style={s.bedReadingLabel}>{r.label}</Text>
            <Text style={[s.bedReadingValue, r.alert && { color: C.danger }]}>{r.value}</Text>
          </View>
        ))}
      </View>

      <View style={s.bedFooter}>
        <Text style={s.bedFooterText}>{deviceLabel}</Text>
        <View style={s.bedFooterBar}>
          <ProgressBar percent={devicePercent} />
        </View>
        <Text style={s.bedFooterTime}>{updatedAt}</Text>
      </View>
    </Card>
  );
}

// ─── 작물 진행 행 ───
export function CropProgressRow({
  crop,
  cropKind,
  where,
  percent,
  onPress,
}: {
  crop: string;
  cropKind?: CropKind;
  where: string;
  percent: number;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.cropRow}>
      <View style={s.cropIcon}>
        {cropKind ? <CropPixel kind={cropKind} size="small" /> : <AppIcon name="sprout" size={20} color={C.brand} />}
      </View>
      <View style={s.cropBody}>
        <View style={s.cropHead}>
          <Text style={s.cropName} numberOfLines={1}>
            {crop}
          </Text>
          <Text style={s.cropWhere}>{where}</Text>
        </View>
        <View style={s.cropBarRow}>
          <ProgressBar percent={percent} height={6} />
          <Text style={s.cropPercent}>{Math.round(percent)}%</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── 재고 행 ───
export function StockRow({
  name,
  cropKind,
  qty,
  unit,
  percent,
  onPress,
}: {
  name: string;
  cropKind?: CropKind;
  qty: number;
  unit: string;
  percent: number;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.stockRow}>
      <View style={s.stockIcon}>
        {cropKind ? <CropPixel kind={cropKind} size="tiny" /> : <AppIcon name="box" size={17} color={C.brand} />}
      </View>
      <View style={s.stockMid}>
        <Text style={s.stockName} numberOfLines={1}>
          {name}
        </Text>
        <ProgressBar percent={percent} />
      </View>
      <View style={s.stockQty}>
        <Text style={s.stockQtyNum}>{qty.toLocaleString()}</Text>
        <Text style={s.stockQtyUnit}>{unit}</Text>
      </View>
    </Pressable>
  );
}

// ─── 센서 타일 ───
// 원본은 정상·주의·위험을 초록·노랑·빨강 배경으로 나눴다. 등급을 색으로 매기지
// 않기로 했으므로 배경은 하나로 두고 상태는 글자로 말한다.
export function SensorTile({
  label,
  value,
  severity,
  onPress,
  style,
}: {
  label: string;
  value: string;
  severity: Severity;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const critical = severity === "critical";
  return (
    <Pressable onPress={onPress} style={[s.sensorTile, style]}>
      <Text style={s.sensorLabel}>{label}</Text>
      <Text style={[s.sensorValue, critical && { color: C.danger }]}>{value}</Text>
      {severity !== "normal" && (
        <Text style={[s.sensorState, critical && { color: C.danger }]}>
          {SEVERITY[severity].label}
        </Text>
      )}
    </Pressable>
  );
}

// ─── 설비 행 ───
export function DeviceRow({
  icon,
  name,
  state,
  on,
  onToggle,
}: {
  icon: IconName;
  name: string;
  state: string;
  on: boolean;
  onToggle?: (next: boolean) => void;
}) {
  return (
    <View style={s.deviceRow}>
      <AppIcon name={icon} size={23} color={C.body} />
      <View style={s.deviceCopy}>
        <Text style={s.deviceName}>{name}</Text>
        <Text style={s.deviceState}>{state}</Text>
      </View>
      <Toggle on={on} onChange={onToggle} />
    </View>
  );
}

// ─── 이력 행 (거래 내역) ───
export function HistoryRow({
  date,
  name,
  qty,
  amount,
}: {
  date: string;
  name: string;
  qty: string;
  amount: string;
}) {
  return (
    <View style={s.historyRow}>
      <Text style={[s.historyCell, { width: 52 }]}>{date}</Text>
      <Text style={[s.historyCell, { flex: 1 }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[s.historyCell, { width: 54, textAlign: "right" }]}>{qty}</Text>
      <Text style={[s.historyAmount, { width: 92 }]}>{amount}</Text>
    </View>
  );
}

// ─── 순위 행 (판매 상위 품목) ───
export function RankRow({
  name,
  cropKind,
  percent,
  value,
}: {
  name: string;
  cropKind?: CropKind;
  percent: number;
  value: string;
}) {
  return (
    <View style={s.rankRow}>
      <View style={s.rankIcon}>
        {cropKind ? <CropPixel kind={cropKind} size="tiny" /> : <AppIcon name="leaf" size={15} color={C.brand} />}
      </View>
      <Text style={s.rankName} numberOfLines={1}>
        {name}
      </Text>
      <View style={s.rankBar}>
        <ProgressBar percent={percent} />
      </View>
      <Text style={s.rankValue}>{value}</Text>
    </View>
  );
}

// ─── 연동 베드 행 ───
export function LinkedBedRow({
  bed,
  crop,
  cropKind,
  maturity,
  harvestLabel,
  expectedQty,
  onPress,
}: {
  bed: string;
  crop: string;
  cropKind?: CropKind;
  maturity: number;
  harvestLabel: string;
  expectedQty: string;
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress} style={s.linkedRow}>
      <View style={s.linkedPreview}>
        <Text style={s.linkedBed}>{bed}</Text>
        {/* Figma의 "MiniPlants" 자리 — 베드 장면 썸네일 */}
        <View style={s.linkedThumb}>
          {cropKind ? (
            <GrowthRackScene kind={cropKind} maturity={maturity} compact />
          ) : (
            <AppIcon name="sprout" size={18} color={C.brand} />
          )}
        </View>
      </View>
      <View style={s.linkedCol}>
        <Text style={s.linkedCrop}>{crop}</Text>
        <Text style={s.linkedLabel}>성숙도</Text>
        <Text style={s.linkedStrong}>{Math.round(maturity)}%</Text>
      </View>
      <View style={s.linkedCol}>
        <Text style={s.linkedLabel}>예상 수확</Text>
        <Text style={s.linkedStrong}>{harvestLabel}</Text>
      </View>
      <View style={s.linkedCol}>
        <Text style={s.linkedLabel}>예상 수확량</Text>
        <Text style={s.linkedStrong}>{expectedQty}</Text>
      </View>
    </Card>
  );
}

// ─── 안내 카드 ───
export function TipCard({ children }: { children: ReactNode }) {
  return (
    <View style={s.tipCard}>
      <View style={s.tipIcon}>
        <AppIcon name="alert" size={16} color={C.brand} />
      </View>
      <View style={s.tipCopy}>
        <Text style={s.tipLabel}>TIP</Text>
        <Text style={s.tipText}>{children}</Text>
      </View>
    </View>
  );
}

// ─── 매장 선택 카드 ───
export function StoreSelectCard({
  name,
  selected,
  stats,
  onPress,
}: {
  name: string;
  selected: boolean;
  stats: { label: string; value: string }[];
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress} selected={selected} style={s.storeCard}>
      {/* Figma는 "이미지 준비 중" 자리표시자다. 매장 도면 에셋으로 채운다. */}
      <View style={s.storeImage}>
        <Image source={STORE_FLOOR_PLAN} style={s.storeImageFill} contentFit="cover" />
      </View>
      <View style={s.storeInfo}>
        <View style={s.storeHead}>
          <Text style={s.storeName} numberOfLines={1}>
            {name}
          </Text>
          <View style={[s.storePill, selected && { backgroundColor: C.brand, borderColor: C.brand }]}>
            <Text style={[s.storePillText, selected && { color: C.paper }]}>
              {selected ? "선택됨" : "선택"}
            </Text>
          </View>
        </View>
        <View style={s.storeStats}>
          {stats.map((st, i) => (
            <View style={s.storeStatWrap} key={st.label}>
              {i > 0 && <Divider vertical />}
              <View style={s.storeStat}>
                <Text style={s.storeStatLabel}>{st.label}</Text>
                <Text style={s.storeStatValue}>{st.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

// ─── 베드 탭 ───
export function BedTabs({
  beds,
  active,
  onChange,
}: {
  beds: string[];
  active: string;
  onChange: (bed: string) => void;
}) {
  return (
    <View style={s.bedTabs}>
      {beds.map((b) => {
        const on = b === active;
        return (
          <Pressable
            key={b}
            onPress={() => onChange(b)}
            style={[s.bedTab, on && { backgroundColor: C.brand, borderColor: C.brand }]}
          >
            <Text style={[s.bedTabText, on && { color: C.paper }]}>{b}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── 빈 상태 ───
export function EmptyState({
  icon = "leaf",
  title,
  description,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <AppIcon name={icon} size={24} color={C.brand} />
      </View>
      <T v="title" style={s.emptyTitle}>
        {title}
      </T>
      <Text style={s.emptyDesc}>{description}</Text>
      {action && <GhostButton label={action} onPress={onAction} tone="brand" style={s.emptyAction} />}
    </View>
  );
}

const s = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionText: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  sectionAction: { fontSize: FS.cap, color: C.body },
  cardTitle: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },

  metricTile: {
    flex: 1,
    minHeight: 71,
    justifyContent: "center",
    gap: SP.xs,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    backgroundColor: C.paper,
    paddingHorizontal: SP.md,
  },
  metricLabel: { fontSize: FS.body, color: C.body },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  metricValue: { fontSize: FS.h2, fontWeight: FW.bold, color: C.brand },
  metricUnit: { fontSize: FS.sm, color: C.ink },

  ackRow: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  ackDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand },
  ackText: { fontSize: FS.sm, color: C.brand },

  alertCard: { gap: SP.md },
  alertHead: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  alertTitle: { flex: 1, fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  alertTime: { fontSize: FS.xs, color: C.muted },
  alertMessage: { fontSize: FS.body, color: C.ink, lineHeight: 20 },

  bedCard: { gap: SP.md, padding: SP.md },
  bedHead: { flexDirection: "row", alignItems: "center", gap: SP.md },
  bedThumb: {
    width: 60,
    height: 41,
    borderRadius: R.sm,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bedCopy: { flex: 1, gap: 2 },
  bedName: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },
  bedSub: { fontSize: FS.sm, color: C.body },
  bedReadings: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line,
    paddingVertical: SP.sm,
  },
  bedReading: { flex: 1, alignItems: "center", gap: 3 },
  bedReadingLabel: { fontSize: FS.sm, color: C.body },
  bedReadingValue: { fontSize: FS.body, fontWeight: FW.semibold, color: C.brand },
  bedFooter: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  bedFooterText: { fontSize: FS.sm, color: C.body },
  bedFooterBar: { flex: 1 },
  bedFooterTime: { fontSize: FS.sm, color: C.muted },

  cropRow: { flexDirection: "row", alignItems: "center", gap: SP.md, paddingVertical: SP.sm },
  cropIcon: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cropBody: { flex: 1, gap: SP.sm },
  cropHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SP.sm },
  cropName: { flex: 1, fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },
  cropWhere: { fontSize: FS.xs, color: C.body },
  cropBarRow: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  cropPercent: { width: 34, textAlign: "right", fontSize: FS.cap, fontWeight: FW.bold, color: C.brand },

  stockRow: { flexDirection: "row", alignItems: "center", gap: SP.md, paddingVertical: SP.sm },
  stockIcon: {
    width: 29,
    height: 29,
    borderRadius: R.xs,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stockMid: { flex: 1, gap: SP.sm },
  stockName: { fontSize: FS.body, color: C.ink },
  stockQty: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  stockQtyNum: { fontSize: FS.lg, color: C.ink },
  stockQtyUnit: { fontSize: FS.sm, color: C.ink },

  sensorTile: {
    flex: 1,
    minHeight: 76,
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    backgroundColor: C.paper,
    paddingHorizontal: SP.md,
  },
  sensorLabel: { fontSize: FS.body, color: C.body },
  sensorValue: { fontSize: FS.h2, fontWeight: FW.bold, color: C.brand },
  sensorState: { fontSize: FS.xs, color: C.body },

  deviceRow: { flexDirection: "row", alignItems: "center", gap: SP.md, paddingVertical: SP.md },
  deviceCopy: { flex: 1, gap: 2 },
  deviceName: { fontSize: FS.body, color: C.ink },
  deviceState: { fontSize: FS.sm, color: C.body },

  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  historyCell: { fontSize: FS.body, color: C.ink },
  historyAmount: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink, textAlign: "right" },

  rankRow: { flexDirection: "row", alignItems: "center", gap: SP.sm, paddingVertical: SP.sm },
  rankIcon: {
    width: 25,
    height: 25,
    borderRadius: R.xs,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rankName: { width: 82, fontSize: FS.body, color: C.ink },
  rankBar: { flex: 1 },
  rankValue: { width: 56, textAlign: "right", fontSize: FS.body, color: C.brand },

  linkedRow: { flexDirection: "row", alignItems: "center", gap: SP.sm, padding: SP.md },
  linkedPreview: { width: 82, gap: SP.xs },
  linkedBed: { fontSize: FS.body, fontWeight: FW.semibold, color: C.brand },
  linkedThumb: {
    height: 32,
    borderRadius: R.xs,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  linkedCol: { flex: 1, gap: 2 },
  linkedCrop: { fontSize: FS.body, fontWeight: FW.semibold, color: C.ink },
  linkedLabel: { fontSize: FS.sm, color: C.body },
  linkedStrong: { fontSize: FS.body, fontWeight: FW.semibold, color: C.brand },

  tipCard: {
    flexDirection: "row",
    gap: SP.md,
    borderRadius: R.md,
    backgroundColor: C.brandSoft,
    padding: SP.md,
  },
  tipIcon: {
    width: 24,
    height: 24,
    borderRadius: R.xs,
    backgroundColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  tipCopy: { flex: 1, gap: SP.xs },
  tipLabel: { fontSize: FS.lg, color: C.brand, fontWeight: FW.semibold },
  tipText: { fontSize: FS.body, color: C.body, lineHeight: 20 },

  storeCard: { padding: 0, overflow: "hidden" },
  storeImage: { height: 172, backgroundColor: C.surface },
  storeImageFill: { width: "100%", height: "100%" },
  storeInfo: { padding: SP.md, gap: SP.md },
  storeHead: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  storeName: { flex: 1, fontSize: FS.h2, fontWeight: FW.semibold, color: C.ink },
  storePill: {
    height: 27,
    paddingHorizontal: SP.md,
    justifyContent: "center",
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
  },
  storePillText: { fontSize: FS.sm, fontWeight: FW.semibold, color: C.body },
  storeStats: { flexDirection: "row" },
  storeStatWrap: { flex: 1, flexDirection: "row" },
  storeStat: { flex: 1, gap: 2, paddingHorizontal: SP.md },
  storeStatLabel: { fontSize: FS.sm, color: C.body },
  storeStatValue: { fontSize: FS.lg, fontWeight: FW.semibold, color: C.ink },

  bedTabs: { flexDirection: "row" },
  bedTab: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
  },
  bedTabText: { fontSize: FS.body, color: C.ink },

  empty: { alignItems: "center", gap: SP.sm, paddingVertical: SP.xxl, paddingHorizontal: SP.lg },
  emptyIcon: {
    width: 45,
    height: 45,
    borderRadius: R.sm,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.sm,
  },
  emptyTitle: { textAlign: "center" },
  emptyDesc: { fontSize: FS.body, color: C.body, textAlign: "center", lineHeight: 20 },
  emptyAction: { marginTop: SP.md, alignSelf: "center" },
});
