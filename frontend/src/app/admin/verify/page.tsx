import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { AdminShell } from "@/components/screens/admin/AdminShell";
import { MilestoneVerifyPanel } from "@/components/farmfi/admin/MilestoneVerifyPanel";

export default async function AdminVerifyPage() {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <AdminShell
      label="마일스톤 검증"
      title="제출된 증빙을 AI 검증에 걸어요"
      desc="검증을 통과한 단계만 집행됩니다."
    >
      <MilestoneVerifyPanel />
    </AdminShell>
  );
}
