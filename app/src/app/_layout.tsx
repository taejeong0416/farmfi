import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "@/lib/auth";
import { BranchProvider } from "@/farmfi/branch";

export default function RootLayout() {
  // 매장 선택은 /store-select에서 하고 /farm/* 전체가 그 선택을 본다.
  // 두 갈래가 같은 값을 보려면 provider가 둘의 공통 조상에 있어야 한다.
  return (
    <AuthProvider>
      <BranchProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </BranchProvider>
    </AuthProvider>
  );
}
