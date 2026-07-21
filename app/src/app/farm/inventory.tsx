import { Text } from "react-native";
import { AppShell } from "@/farmfi/components";

// TODO: 다음 단위에서 MobileInventoryScreen 이식으로 교체
export default function InventoryRoute() {
  return (
    <AppShell active="inventory">
      <Text style={{ padding: 20, color: "#656863" }}>연동 화면 준비 중</Text>
    </AppShell>
  );
}
