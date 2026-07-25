import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { Section } from "@/components/FarmFi";
import { DemoConsole } from "./DemoConsole";

// /admin/page.tsx · /admin/verify/page.tsx 와 동일한 서버 게이트.
// 클라이언트 체크만으로는 우회 가능하므로 렌더 전에 서버에서 막는다.
export default async function AdminDemoPage() {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="page">
      <Section
        title="데모 콘솔"
        desc="시연 시나리오를 스텝 단위로 실행합니다. 청약 → 마일스톤 검증·트랜치 집행 → 배당 순서."
      >
        <DemoConsole />
      </Section>
    </main>
  );
}
