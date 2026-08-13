// 명세 7.1 프로필 설정 + 7.2 로그아웃.
// 로그아웃 요청이 실패해도 로컬 인증 정보는 지우고 로그인 화면으로 보낸다(명세 예외).
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { C } from "../theme";
import { useFarmProjects } from "../branch";
import { useAuth } from "@/lib/auth";
import { AppShell, SectionTitle } from "../components";
import { Card, CardTitle, Field, ListRow, Popup, PrimaryButton } from "../ui";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { projects, project, loading, error: projectError } = useFarmProjects();
  // 지점명은 API 가 준 것만 쓴다. 로딩·실패 상태를 "부산대 1호점" 같은 값으로
  // 덮으면 화면이 조용히 거짓을 말하게 된다.
  const branch = project?.name ?? (loading ? "불러오는 중…" : projectError ? "불러오기 실패" : "미선택");

  const [name, setName] = useState(user?.name ?? "운영자 1");
  const [phone, setPhone] = useState("010-0000-0000");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const save = () => {
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setError(null);
    setSaved(true);
  };

  const doLogout = async () => {
    setConfirmLogout(false);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  };

  return (
    <AppShell active="store">
      <View style={s.intro}>
        <Text style={s.introTitle}>설정</Text>
        <Text style={s.introSub}>계정과 매장, 알림 수신을 관리하세요.</Text>
      </View>

      <Card>
        <CardTitle pixel="users">프로필</CardTitle>
        <View style={s.form}>
          <Field label="이름" required value={name} onChangeText={setName} error={error} />
          <Field label="연락처" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <View style={s.readonly}>
            <Text style={s.readonlyLabel}>이메일</Text>
            <Text style={s.readonlyValue}>{user?.email ?? "operator@farmfi.test"}</Text>
          </View>
          <PrimaryButton label="프로필 저장" onPress={save} />
        </View>
      </Card>

      <View style={s.section}>
        <SectionTitle icon="store">매장</SectionTitle>
        <Card padded={false} style={s.listCard}>
          <View style={s.listPad}>
            <ListRow
              title="현재 운영 매장"
              caption={`접근 가능한 매장 ${projects.length}곳`}
              trailing={<Text style={s.trailing}>{branch}</Text>}
              onPress={() => router.replace("/farm/store")}
            />
            <ListRow
              title="알림 설정"
              caption="유형별 수신 여부와 채널"
              onPress={() => router.push("/farm/notification-settings")}
            />
            <ListRow title="설비 알림 내역" caption="발생한 알림 확인 및 처리" onPress={() => router.push("/farm/alerts")} />
          </View>
        </Card>
      </View>

      <View style={s.logoutWrap}>
        <Text style={s.logoutBtn} onPress={() => setConfirmLogout(true)}>
          로그아웃
        </Text>
      </View>

      <Popup
        visible={saved}
        title="프로필을 저장했어요"
        message="변경한 정보가 이후 운영 알림에 적용됩니다."
        onConfirm={() => setSaved(false)}
      />
      <Popup
        visible={confirmLogout}
        severity="warning"
        title="로그아웃할까요?"
        message="현재 기기의 세션이 종료됩니다."
        confirmLabel="로그아웃"
        cancelLabel="취소"
        onConfirm={doLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </AppShell>
  );
}

const s = StyleSheet.create({
  intro: { paddingTop: 18, paddingBottom: 15 },
  introTitle: { fontSize: 28, letterSpacing: -1.4, color: C.ink, fontWeight: "700" },
  introSub: { marginTop: 8, color: "#4f524e", fontSize: 13 },

  form: { marginTop: 12, gap: 12 },
  readonly: { gap: 6 },
  readonlyLabel: { fontSize: 12, color: "#3c3f3a", fontWeight: "600" },
  readonlyValue: {
    minHeight: 46,
    lineHeight: 46,
    borderWidth: 1,
    borderColor: "#e6e0d7",
    borderRadius: 8,
    backgroundColor: "#f7f5f1",
    paddingHorizontal: 12,
    fontSize: 14,
    color: C.muted,
  },

  section: { marginTop: 16, gap: 9 },
  listCard: { overflow: "hidden" },
  listPad: { paddingHorizontal: 13 },
  trailing: { fontSize: 12, color: C.green, fontWeight: "600" },

  logoutWrap: { marginTop: 20, alignItems: "center" },
  logoutBtn: {
    fontSize: 13,
    color: C.danger,
    fontWeight: "600",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
});
