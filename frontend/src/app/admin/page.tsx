import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { AdminDashboard } from "@/components/farmfi/admin/AdminDashboard";

// 서버 컴포넌트에서 세션을 확인해 admin이 아니면 렌더 자체를 하지 않는다.
// (클라이언트 체크만으로는 우회 가능 — 항상 서버에서 먼저 막는다.)
export default async function AdminPage() {
  const session = await getServerSession();

  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return <AdminDashboard />;
}
