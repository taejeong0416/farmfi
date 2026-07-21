import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { MilestoneVerifyPanel, Section } from "@/components/FarmFi";

export default async function AdminVerifyPage() {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="page">
      <Section
        title="마일스톤 검증 콘솔"
        desc="제출된 증빙을 AI 멀티시그널로 검증하고, 통과 시 에스크로 트랜치를 온체인 집행합니다."
      >
        <MilestoneVerifyPanel />
      </Section>
    </main>
  );
}
