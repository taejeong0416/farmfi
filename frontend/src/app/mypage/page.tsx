import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { MyPageScreen } from "@/components/screens/common/MyPageScreen";

// 세션은 서버에서 먼저 막는다 — 클라이언트 확인만으로는 우회할 수 있다.
export default async function MyPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }
  return <MyPageScreen />;
}
