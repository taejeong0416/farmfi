import { Suspense } from "react";
import { LoginScreen } from "@/components/screens/common/LoginScreen";

export const metadata = { title: "로그인 | FarmFi" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
