import { Card } from "@/components/ui";
import { AdminShell } from "@/components/screens/admin/AdminShell";
import { DemoConsole } from "./DemoConsole";
import { InvestorProtectionPanel } from "@/components/farmfi/admin/InvestorProtectionPanel";

// 관문은 /admin 레이아웃의 requirePageRole 하나다. 여기서 role만 따로 보면
// 시연 계정이 콘솔 안에서 이 화면 하나에만 못 들어간다 — 시연 도구인데 그렇다.
export default function AdminDemoPage() {
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
