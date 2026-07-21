import { Stack } from "expo-router";
import { BranchProvider } from "@/farmfi/branch";

export default function FarmLayout() {
  return (
    <BranchProvider>
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </BranchProvider>
  );
}
