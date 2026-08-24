// 01 매장 선택 — 운영자가 오늘 볼 지점을 고른다. 고른 값은 /farm/* 전체가 본다.
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { C, FRAME_MAX_WIDTH, FS, FW, GUTTER, SP } from "@/farmfi/theme";
import { useFarmProjects } from "@/farmfi/branch";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/farmfi/useApiResource";
import { projectStatusLabel, type InventoryResponse } from "@/farmfi/api";
import {
  EmptyState,
  GhostButton,
  PrimaryButton,
  StateNotice,
  StoreSelectCard,
  TipCard,
  useGo,
} from "@/farmfi/ui";

export default function StoreSelectScreen() {
  const go = useGo();
  const { logout } = useAuth();
  const { projects, projectId, setProjectId, loading, error, reload } = useFarmProjects();
  const [picked, setPicked] = useState<string | null>(null);

  // 카드에 올릴 수치(수확 가능·재배 베드)는 재고 API의 지점별 요약에서 온다.
  const inv = useApiResource<InventoryResponse>("/api/inventory", "재고 요약을 불러오지 못했습니다.");

  const selected = picked ?? projectId;

  const statsOf = (id: string) => {
    const p = inv.data?.projects.find((x) => x.projectId === id);
    return p ? { harvest: `${p.summary.harvestReadyTotal}봉`, beds: `${p.summary.bedCount}개` } : null;
  };

  const confirm = () => {
    if (!selected) return;
    setProjectId(selected);
    go.replace("/farm/dashboard");
  };

  return (
    <SafeAreaView style={s.stage} edges={["top", "bottom"]}>
      <View style={s.frame}>
        <View style={s.header}>
          <Text style={s.headerTitle}>매장 선택</Text>
          <Text style={s.headerSub}>운영할 지점을 고르면 오늘의 현황이 열립니다</Text>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {loading && <StateNotice message="지점 목록을 불러오는 중입니다…" />}
          {error && <StateNotice tone="error" message={error} onRetry={reload} />}

          {!loading && !error && projects.length === 0 && (
            <EmptyState
              icon="store"
              title="배정된 매장이 없어요"
              description="운영자로 배정된 지점이 생기면 여기에 나타납니다."
            />
          )}

          {projects.map((p) => {
            const st = statsOf(p.id);
            return (
              <StoreSelectCard
                key={p.id}
                name={p.name}
                selected={p.id === selected}
                onPress={() => setPicked(p.id)}
                stats={[
                  { label: "농장 상태", value: projectStatusLabel(p.status) },
                  { label: "수확 가능", value: st?.harvest ?? "—" },
                  { label: "재배 베드", value: st?.beds ?? "—" },
                ]}
              />
            );
          })}

          {projects.length > 0 && (
            <TipCard>매장을 선택하면 운영, 모니터링, 리포트 정보를 확인할 수 있어요.</TipCard>
          )}
        </ScrollView>

        {/* 고를 게 없으면 "선택 완료"도 없다. 그 화면에는 뒤로가기도 탭도 없어서
            빠져나갈 문이 하나도 남지 않는다 — 배정 대기 중인 계정이 여기 갇힌다.
            계정을 잘못 골랐을 수도 있으니 로그인 화면으로 가는 문은 열어둔다. */}
        {projects.length > 0 ? (
          <View style={s.footer}>
            <PrimaryButton label="선택 완료" onPress={confirm} disabled={!selected} />
          </View>
        ) : (
          !loading && (
            <View style={s.footer}>
              <GhostButton
                label="다른 계정으로 로그인"
                icon="logout"
                onPress={() => {
                  void logout().then(() => go.replace("/login?e=session"));
                }}
              />
            </View>
          )
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: C.surface },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: "center",
    backgroundColor: C.paper,
  },
  header: {
    gap: SP.xs,
    paddingHorizontal: GUTTER,
    paddingVertical: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  headerTitle: { fontSize: FS.xl, fontWeight: FW.semibold, color: C.ink },
  headerSub: { fontSize: FS.sm, color: C.body },
  content: { padding: GUTTER, gap: SP.lg },
  footer: {
    padding: GUTTER,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
    backgroundColor: C.paper,
  },
});
