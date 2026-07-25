import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { C } from "../theme";
import { AppIcon } from "../icons";
import { OPERATOR_PORTRAIT, STORE_FLOOR_PLAN, TOMATO_BED } from "../assets";
import type { TodayTasksResponse } from "../api";
import { AppShell, BranchSelect, SectionTitle, StateNotice, TapScale } from "../components";
import { useFarmProjects } from "../branch";
import { useApiResource } from "../useApiResource";
import { useAuth } from "@/lib/auth";

// 매장 공간도 라벨 (원본 % 좌표, 대략 중심 정렬용 오프셋)
const FLOOR_LABELS: Array<{ text: string; left: string; top: string; w: number }> = [
  { text: "베드 A", left: "23%", top: "18%", w: 46 },
  { text: "베드 B", left: "77%", top: "18%", w: 46 },
  { text: "베드 C", left: "23%", top: "69%", w: 46 },
  { text: "베드 D", left: "77%", top: "69%", w: 46 },
  { text: "작업대", left: "50%", top: "43%", w: 40 },
  { text: "채소 판매 코너", left: "50%", top: "88%", w: 92 },
];

const ROLE_LABEL: Record<string, string> = {
  operator: "운영자",
  admin: "관리자",
  investor: "투자자",
  landlord: "공간주",
};

export default function AssignmentScreen() {
  const { user } = useAuth();
  const { projectId, loading: projectsLoading, error: projectsError, reload: reloadProjects } =
    useFarmProjects();
  const [message, setMessage] = useState("운영자 변경");

  const today = useApiResource<TodayTasksResponse>(
    projectId ? `/api/tasks/today?projectId=${projectId}` : null,
    "오늘 할 일을 불러오지 못했습니다."
  );

  const tasks = today.data?.tasks ?? [];
  const taskLine = today.loading
    ? "오늘 할 일 확인 중…"
    : today.error
      ? "오늘 할 일을 불러오지 못했습니다"
      : `오늘 할 일 ${tasks.length}건`;

  const taskSection = () => {
    if (projectsError) {
      return <StateNotice tone="error" message={projectsError} onRetry={reloadProjects} />;
    }
    if (projectsLoading || today.loading) {
      return <StateNotice message="오늘 할 일을 불러오는 중…" />;
    }
    if (today.error) {
      return <StateNotice tone="error" message={today.error} onRetry={today.reload} />;
    }
    if (tasks.length === 0) {
      return (
        <StateNotice
          message="오늘 처리할 수확·보충 작업이 없습니다."
          onRetry={today.reload}
          retryLabel="새로고침"
        />
      );
    }
    return (
      <View style={s.taskList}>
        {tasks.map((task, i) => (
          <View key={`${task.type}-${task.productId}-${i}`} style={s.taskRow}>
            <View style={[s.taskBadge, task.type === "harvest" ? s.taskBadgeHarvest : s.taskBadgeRestock]}>
              <Text style={s.taskBadgeText}>{task.type === "harvest" ? "수확" : "보충"}</Text>
            </View>
            <Text style={s.taskText}>{task.message}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <AppShell active="assignment">
      <BranchSelect />
      <View style={s.intro}>
        <Text style={s.introTitle}>운영자 배정</Text>
        <Text style={s.introSub}>매장의 운영자를 배정하고 근무 정보를 관리해주세요.</Text>
      </View>

      <View style={s.section}>
        <SectionTitle icon="users">현재 운영자</SectionTitle>
        <TapScale style={s.operatorCard} scaleTo={0.988} onPress={() => setMessage("운영자 상세 확인")}>
          <View style={s.operatorImageWrap}>
            <Image source={OPERATOR_PORTRAIT} style={s.operatorImage} contentFit="contain" contentPosition="bottom" />
          </View>
          <View style={s.operatorCopy}>
            <View style={s.operatorNameRow}>
              <Text style={s.operatorName} numberOfLines={1}>
                {user ? user.name : "미로그인"}
              </Text>
              <View style={s.workBadge}>
                <Text style={s.workBadgeText}>{user ? (ROLE_LABEL[user.role] ?? user.role) : "로그인 필요"}</Text>
              </View>
            </View>
            <View style={s.operatorTime}>
              <AppIcon name="clock" size={18} color="#30322f" />
              <Text style={s.operatorTimeText}>{taskLine}</Text>
            </View>
          </View>
          <Text style={s.chevronR}>›</Text>
        </TapScale>
      </View>

      <View style={s.section}>
        <SectionTitle icon="check">오늘 할 일</SectionTitle>
        {taskSection()}
      </View>

      <View style={s.floorSection}>
        <SectionTitle icon="sprout">매장 공간 구조</SectionTitle>
        <View style={s.floorPlan}>
          <Image source={STORE_FLOOR_PLAN} style={s.floorImage} contentFit="cover" />
          <View style={s.tomatoBed}>
            <Image source={TOMATO_BED} style={s.tomatoBedImg} contentFit="fill" />
          </View>
          {FLOOR_LABELS.map((l) => (
            <View
              key={l.text}
              style={[s.floorLabel, { left: l.left as `${number}%`, top: l.top as `${number}%`, marginLeft: -l.w / 2, marginTop: -11 }]}
            >
              <Text style={s.floorLabelText}>{l.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <TapScale
        style={s.changeBtn}
        scaleTo={0.98}
        onPress={() => setMessage((c) => (c === "운영자 변경" ? "운영자 선택 열기" : "운영자 변경"))}
      >
        <AppIcon name="user" size={23} color="#fff" />
        <Text style={s.changeBtnText}>{message}</Text>
      </TapScale>
    </AppShell>
  );
}

const s = StyleSheet.create({
  intro: { paddingTop: 21, paddingBottom: 13, alignItems: "center" },
  introTitle: { fontSize: 30, letterSpacing: -1.6, color: C.ink, fontWeight: "700" },
  introSub: { marginTop: 9, color: "#4f524e", fontSize: 13, textAlign: "center" },

  section: { marginTop: 8 },
  operatorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 108,
    borderWidth: 1,
    borderColor: "#d9d1c7",
    borderRadius: 10,
    backgroundColor: "#fff",
    marginTop: 9,
    paddingLeft: 8,
    paddingRight: 14,
  },
  operatorImageWrap: { width: 84, height: 101, alignSelf: "flex-end", overflow: "hidden" },
  operatorImage: { width: "100%", height: "100%" },
  operatorCopy: { flex: 1 },
  operatorNameRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  operatorName: { flexShrink: 1, fontSize: 24, letterSpacing: -1.2, color: C.ink, fontWeight: "700" },
  workBadge: { borderRadius: 5, backgroundColor: C.green, paddingHorizontal: 8, paddingVertical: 6 },
  workBadgeText: { color: "#fff", fontSize: 10 },
  operatorTime: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 11 },
  operatorTimeText: { flex: 1, color: "#30322f", fontSize: 12 },
  chevronR: { fontSize: 35, fontWeight: "300", color: C.ink },

  taskList: { marginTop: 9, gap: 6 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#e2dcd4",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  taskBadge: { minWidth: 38, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5 },
  taskBadgeHarvest: { backgroundColor: C.green },
  taskBadgeRestock: { backgroundColor: "#b8722c" },
  taskBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", textAlign: "center" },
  taskText: { flex: 1, color: "#30322f", fontSize: 12, lineHeight: 17 },

  floorSection: { marginTop: 15 },
  floorPlan: {
    aspectRatio: 1.09,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#8a8175",
    borderRadius: 6,
    marginTop: 9,
    backgroundColor: "#eee9dd",
  },
  floorImage: { width: "100%", height: "100%" },
  tomatoBed: { position: "absolute", top: "55.1%", left: "60.5%", width: "30.2%", height: "20.5%", overflow: "hidden" },
  tomatoBedImg: { width: "100%", height: "100%", transform: [{ scaleX: 1.52 }, { scaleY: 1.78 }] },
  floorLabel: {
    position: "absolute",
    borderRadius: 3,
    backgroundColor: "rgba(45,42,36,0.72)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  floorLabelText: { color: "#fff", fontSize: 13 },

  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: C.green,
    marginTop: 12,
  },
  changeBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
