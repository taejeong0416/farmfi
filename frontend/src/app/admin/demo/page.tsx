import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { Card } from "@/components/ui";
import { AdminShell } from "@/components/screens/admin/AdminShell";
import { DemoConsole } from "./DemoConsole";
import { InvestorProtectionPanel } from "@/components/farmfi/admin/InvestorProtectionPanel";

// 다른 관리자 화면과 같은 서버 게이트. 렌더 전에 서버에서 막는다.
export default async function AdminDemoPage() {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <AdminShell
      label="데모 콘솔"
      title="시연 시나리오를 단계별로 실행해요"
      desc="투자 신청 → 마일스톤 검증·집행 → 회수금 순서."
    >
      <DemoConsole />

      <h2 className="mt-10 text-15 font-bold text-ink">투자자 보호 시연</h2>
      <p className="mt-2 text-12 text-muted">
        마일스톤 기한이 지나면 라운드를 실패로 전환하고 남은 자금을 보유 구좌 비례로 환불합니다.
      </p>
      <Card className="mt-4">
        <InvestorProtectionPanel />
      </Card>
    </AdminShell>
  );
}
