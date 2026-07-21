import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth, type Role } from "@/lib/auth";

const ROLE_LABEL: Record<Role, string> = {
  investor: "투자자",
  operator: "운영자",
  landlord: "건물주",
  admin: "관리자",
};

export default function HomeScreen() {
  const { user, loading, logout } = useAuth();

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16a34a" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.hello}>{user.name}님, 환영합니다</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABEL[user.role] ?? user.role}</Text>
        </View>
        <Text style={styles.note}>역할별 대시보드는 다음 단계에서 연결됩니다.</Text>

        <Pressable style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, padding: 24, justifyContent: "center" },
  hello: { fontSize: 24, fontWeight: "800", color: "#111827" },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  roleText: { color: "#16a34a", fontWeight: "700", fontSize: 13 },
  note: { color: "#6b7280", fontSize: 14, marginTop: 16 },
  logoutBtn: {
    marginTop: 32,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  logoutText: { color: "#374151", fontWeight: "600", fontSize: 15 },
});
