import { Suspense } from "react";
import { SubscribeDoneScreen } from "@/components/screens/buyer/SubscribeDoneScreen";

export const metadata = { title: "정기구독 신청 완료 | FarmFi" };

export default function Page() {
  return (
    <Suspense>
      <SubscribeDoneScreen />
    </Suspense>
  );
}
