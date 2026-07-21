import { Text } from "react-native";
import { AppShell } from "@/farmfi/components";

// TODO: 다음 단위에서 MobileGrowthScreen 이식으로 교체
export default function GrowthRoute() {
  return (
    <AppShell active="growth">
      <Text style={{ padding: 20, color: "#656863" }}>모니터링 화면 준비 중</Text>
    </AppShell>
  );
}
