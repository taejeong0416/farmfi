import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "@/lib/auth";

// 루트는 머무는 화면이 아니라 통과 지점이다. 로그인 직후와 세션 복구가 모두
// 여기를 거치므로, 도착하면 곧장 운영 화면 첫 탭으로 넘긴다.
export default function HomeScreen() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16a34a" />
      </View>
    );
  }

  return <Redirect href="/farm/store" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
