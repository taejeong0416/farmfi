import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { MyPageClient } from "@/components/farmfi/auth/MyPageClient";

// 서버 컴포넌트에서 세션을 먼저 확인한다 — 클라이언트 체크만으로는 우회
// 가능하므로 항상 서버에서 먼저 막는다(admin/page.tsx와 동일 패턴).
export default async function MyPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="page">
      <section className="section">
        <MyPageClient />
      </section>
    </main>
  );
}
