import { Text } from "react-native";
import { AppShell } from "@/farmfi/components";

// TODO: 다음 단위에서 MobileSalesScreen 이식으로 교체
export default function SalesRoute() {
  return (
    <AppShell active="sales">
      <Text style={{ padding: 20, color: "#656863" }}>리포트 화면 준비 중</Text>
    </AppShell>
  );
}
