import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { C } from "../theme";
import { AppIcon, PixelGlyph } from "../icons";
import {
  cropKindOf,
  rackIdAt,
  stageLabel,
  type InventoryResponse,
  type MonitoringSummaryResponse,
} from "../api";
import {
  AppShell,
  BranchSelect,
  DataAsOf,
  GrowthRackScene,
  SectionTitle,
  StateNotice,
} from "../components";
import { useFarmProjects } from "../branch";
import { useApiResource } from "../useApiResource";

function Diamond() {
  return <View style={s.diamond} />;
}

const MONITOR_DAYS = 7;

export default function GrowthScreen() {
  const { projectId, loading: projectsLoading, error: projectsError, reload: reloadProjects } =
    useFarmProjects();
  const [bedIndex, setBedIndex] = useState(0);

  // 센서 요약(가동률·상태·습도)과 재배 현황(베드·성숙도·수확량)은 출처가 다르다.
  const monitoring = useApiResource<MonitoringSummaryResponse>(
    projectId ? `/api/monitoring/${projectId}?days=${MONITOR_DAYS}` : null,
    "센서 요약을 불러오지 못했습니다."
  );
  const inventory = useApiResource<InventoryResponse>(
    projectId ? `/api/inventory?projectId=${projectId}` : null,
    "재배 현황을 불러오지 못했습니다."
  );

  const beds = inventory.data?.projects[0]?.items ?? [];
  const summary = inventory.data?.projects[0]?.summary ?? null;
  const activeIndex = Math.min(bedIndex, Math.max(0, beds.length - 1));
  const bed = beds[activeIndex] ?? null;

  // 지점을 바꾸면 베드 선택을 처음으로 되돌린다 (품목 구성이 지점마다 다름).
  useEffect(() => {
    setBedIndex(0);
  }, [projectId]);

  // 베드 전환 시 페이드 인 (원본 AnimatePresence 전환 대체)
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = 0;
    op.value = withTiming(1, { duration: 220, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [activeIndex, op]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: op.value }));

  const latestPoint = monitoring.data?.points.at(-1) ?? null;
  const metricsLoading = monitoring.loading || inventory.loading || projectsLoading;
  const dash = metricsLoading ? "…" : "–";

  const bedSection = () => {
    if (projectsError) {
      return <StateNotice tone="error" message={projectsError} onRetry={reloadProjects} />;
    }
    if (projectsLoading || inventory.loading) {
      return <StateNotice message="재배 현황을 불러오는 중…" />;
    }
    if (inventory.error) {
      return <StateNotice tone="error" message={inventory.error} onRetry={inventory.reload} />;
    }
    if (!bed) {
      return (
        <StateNotice
          message="이 지점에 재배 중인 베드가 없습니다."
          onRetry={inventory.reload}
          retryLabel="새로고침"
        />
      );
    }

    const kind = cropKindOf(bed.productName, bed.category);
    return (
      <>
        <View style={s.bedTabs}>
          {beds.map((item, i) => {
            const on = i === activeIndex;
            return (
              <Text
                key={item.productId}
                onPress={() => setBedIndex(i)}
                style={[
                  s.bedTab,
                  i === 0 && s.bedTabFirst,
                  i === beds.length - 1 && s.bedTabLast,
                  i > 0 && s.bedTabNoLeft,
                  on && s.bedTabActive,
                ]}
              >
                베드 {rackIdAt(i)}
              </Text>
            );
          })}
        </View>
        <Animated.View style={[s.rackCard, cardStyle]}>
          <View style={s.rackImage}>
            <GrowthRackScene kind={kind} maturity={bed.maturityPercent} />
            <View style={s.stageBadge}>
              <Text style={s.stageBadgeText}>
                {bed.productName} · {stageLabel(bed.maturityPercent)} {bed.maturityPercent}%
              </Text>
            </View>
          </View>
          <View style={s.rackStatus}>
            <View style={s.statusSide}>
              <AppIcon name="check" size={30} color={C.green} />
              <View>
                <Text style={s.statusSmall}>생육 상태</Text>
                <Text style={s.statusB}>
                  {monitoring.data ? (monitoring.data.summary.latestHealthy ? "정상" : "주의") : dash}
                </Text>
              </View>
            </View>
            <View style={s.statusDivider} />
            <View style={s.statusSide}>
              <AppIcon name="drop" size={30} color={C.green} />
              <View>
                <Text style={s.statusSmall}>습도</Text>
                <Text style={s.statusB}>
                  {latestPoint ? `${latestPoint.humidity.toFixed(0)}%` : dash}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </>
    );
  };

  return (
    <AppShell active="growth">
      <BranchSelect />
      <View style={s.hero}>
        <PixelGlyph name="sprout" size={47} />
        <Text style={s.heroTitle}>성장 모니터링</Text>
        <View style={s.heroSub}>
          <Diamond />
          <Text style={s.heroSubText}>실시간으로 작물의 성장 상태를 확인하세요.</Text>
          <Diamond />
        </View>
      </View>

      <View style={s.metrics}>
        <View style={s.metric}>
          <View style={s.metricLabelRow}>
            <PixelGlyph name="sprout" size={18} />
            <Text style={s.metricLabel}>센서 가동률</Text>
          </View>
          <Text style={s.metricValue}>
            {monitoring.data ? monitoring.data.summary.uptimeRate : dash}
            <Text style={s.metricUnit}>%</Text>
          </Text>
        </View>
        <View style={s.metric}>
          <View style={s.metricLabelRow}>
            <PixelGlyph name="basket" size={18} />
            <Text style={s.metricLabel}>오늘 수확 가능</Text>
          </View>
          <Text style={s.metricValue}>
            {summary ? summary.harvestReadyTotal : dash}
            <Text style={s.metricUnit}>봉</Text>
          </Text>
        </View>
        <View style={s.metric}>
          <View style={s.metricLabelRow}>
            <PixelGlyph name="bars" size={18} />
            <Text style={s.metricLabel}>이번 달 수확량</Text>
          </View>
          <Text style={s.metricValue}>
            {summary ? summary.monthlyHarvest : dash}
            <Text style={s.metricUnit}>봉</Text>
          </Text>
        </View>
      </View>

      {monitoring.data && (
        <DataAsOf dataAsOf={monitoring.data.dataAsOf} stale={monitoring.data.stale} />
      )}

      {monitoring.error && !monitoring.loading && (
        <StateNotice tone="error" message={monitoring.error} onRetry={monitoring.reload} />
      )}

      {/* 생장 지표 — 환경값이 아니라 "얼마나 자랐나"를 본다.
          적산온도로 수확 시점을, 일적산광량으로 그 속도의 제약을 읽는다. */}
      {monitoring.data && (
        <View style={s.growth}>
          <View style={s.growthRow}>
            <View style={s.growthCell}>
              <Text style={s.growthLabel}>수확 예정</Text>
              <Text style={s.growthValue}>
                {monitoring.data.harvest.daysRemaining != null
                  ? `D-${Math.ceil(monitoring.data.harvest.daysRemaining)}`
                  : "–"}
              </Text>
            </View>
            <View style={s.growthDivider} />
            <View style={s.growthCell}>
              <Text style={s.growthLabel}>생장 진행률</Text>
              <Text style={s.growthValue}>
                {monitoring.data.harvest.gddProgressPct}
                <Text style={s.growthUnit}>%</Text>
              </Text>
            </View>
            <View style={s.growthDivider} />
            <View style={s.growthCell}>
              <Text style={s.growthLabel}>일적산광량</Text>
              <Text
                style={[
                  s.growthValue,
                  monitoring.data.light.status === "under" && s.growthValueWarn,
                ]}
              >
                {monitoring.data.light.ratioPct}
                <Text style={s.growthUnit}>%</Text>
              </Text>
            </View>
          </View>
          <View style={s.growthTrack}>
            <View
              style={[
                s.growthFill,
                { width: `${Math.min(100, monitoring.data.harvest.gddProgressPct)}%` },
              ]}
            />
          </View>
          <Text style={s.growthMsg}>{monitoring.data.harvest.message}</Text>
        </View>
      )}

      <Link href="/farm/monitoring" style={s.monitorBtn}>
        상세 센서 모니터링 →
      </Link>

      <View style={s.bedSection}>
        <SectionTitle icon="sprout">실시간 성장 베드</SectionTitle>
        {bedSection()}
      </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  diamond: { width: 7, height: 7, backgroundColor: "#9b8c73", transform: [{ rotate: "45deg" }] },

  hero: { alignItems: "center", paddingTop: 13, paddingBottom: 12 },
  heroTitle: { marginTop: 7, fontSize: 29, letterSpacing: -1.2, color: C.ink, fontWeight: "700" },
  heroSub: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 9 },
  heroSubText: { color: "#474a46", fontSize: 13 },

  metrics: { flexDirection: "row", gap: 7 },
  metric: {
    flex: 1,
    minHeight: 91,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d9d1c5",
    borderRadius: 10,
    backgroundColor: "#fffefa",
    paddingHorizontal: 3,
    paddingVertical: 8,
  },
  metricLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricLabel: { fontSize: 10, fontWeight: "600", color: "#333" },
  metricValue: { marginTop: 8, color: C.green, fontSize: 25, letterSpacing: -1, fontWeight: "700" },
  metricUnit: { color: "#151715", fontSize: 12, fontWeight: "500" },

  growth: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#d9d1c5",
    borderRadius: 10,
    backgroundColor: "#fffefa",
    padding: 13,
  },
  growthRow: { flexDirection: "row", alignItems: "center" },
  growthCell: { flex: 1, alignItems: "center" },
  growthDivider: { width: 1, height: 32, backgroundColor: "#e2dcd2" },
  growthLabel: { fontSize: 10, fontWeight: "600", color: "#666862" },
  growthValue: { marginTop: 5, color: C.green, fontSize: 19, letterSpacing: -0.6, fontWeight: "700" },
  growthValueWarn: { color: "#c0492f" },
  growthUnit: { color: "#151715", fontSize: 11, fontWeight: "500" },
  growthTrack: { marginTop: 11, height: 7, borderRadius: 999, backgroundColor: "#eef2ee", overflow: "hidden" },
  growthFill: { height: "100%", borderRadius: 999, backgroundColor: C.green },
  growthMsg: { marginTop: 9, fontSize: 11, lineHeight: 16, color: "#4a5a4d", textAlign: "center" },

  monitorBtn: {
    marginTop: 12,
    height: 46,
    lineHeight: 46,
    textAlign: "center",
    backgroundColor: C.green,
    color: "#fff",
    borderRadius: 10,
    fontWeight: "700",
    fontSize: 14,
    overflow: "hidden",
  },

  bedSection: { marginTop: 18 },
  bedTabs: { flexDirection: "row", marginTop: 10 },
  bedTab: {
    flex: 1,
    height: 41,
    lineHeight: 41,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#d6cec2",
    backgroundColor: "#fff",
    fontSize: 13,
    color: C.ink,
  },
  bedTabFirst: { borderTopLeftRadius: 9 },
  bedTabLast: { borderTopRightRadius: 9 },
  bedTabNoLeft: { borderLeftWidth: 0 },
  bedTabActive: { borderColor: C.green, backgroundColor: C.green, color: "#fff", fontWeight: "700" },

  rackCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d6cec2",
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
    backgroundColor: "#fff",
  },
  rackImage: { aspectRatio: 1.25, overflow: "hidden", backgroundColor: "#f4f3ef" },
  stageBadge: {
    position: "absolute",
    top: 9,
    left: 9,
    borderWidth: 1,
    borderColor: "rgba(30,96,61,0.26)",
    borderRadius: 5,
    backgroundColor: "rgba(255,254,250,0.91)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stageBadgeText: { color: C.greenDark, fontSize: 10, fontWeight: "700" },

  rackStatus: { flexDirection: "row", alignItems: "center", minHeight: 66 },
  statusSide: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  statusDivider: { width: 1, height: 44, backgroundColor: "#ddd7ce" },
  statusSmall: { color: "#666862", fontSize: 11 },
  statusB: { color: C.green, fontSize: 17, fontWeight: "600" },
});
