import { Text } from "react-native";
import { AppShell } from "@/farmfi/components";

// TODO: 다음 단위에서 MobileAssignmentScreen 이식으로 교체
export default function AssignmentRoute() {
  return (
    <AppShell active="assignment">
      <Text style={{ padding: 20, color: "#656863" }}>운영 화면 준비 중</Text>
    </AppShell>
  );
}
