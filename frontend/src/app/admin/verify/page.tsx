import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { PageHeading, Shell } from "@/components/ui";
import { MilestoneVerifyPanel } from "@/components/farmfi/admin/MilestoneVerifyPanel";

export default async function AdminVerifyPage() {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <Shell>
      <PageHeading
        eyebrow="관리자 콘솔"
        title="마일스톤 검증"
        desc="제출된 증빙을 AI 검증에 걸고, 통과한 단계만 집행합니다."
      />
      <MilestoneVerifyPanel />
    </Shell>
  );
}
