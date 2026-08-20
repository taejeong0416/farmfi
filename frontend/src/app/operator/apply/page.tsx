import { Suspense } from "react";
import { ApplyScreen } from "@/components/screens/operator/ApplyScreen";

export const metadata = { title: "자격 · 서류 신청 | FarmFi" };

export default function Page() {
  return (
    <Suspense>
      <ApplyScreen />
    </Suspense>
  );
}
