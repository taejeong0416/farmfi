import { GreenBand, Hero } from "@/components/FarmFi";
import { ProjectsExplorer } from "@/components/farmfi/project/ProjectsExplorer";

export default function ProjectsPage() {
  return (
    <main className="page">
      <Hero
        art="project"
        title="도심 미니팜 프로젝트 둘러보기"
        lead="다양한 도심 미니팜 프로젝트를 한눈에 비교해보세요. 공간, 운영자, 임팩트, 기대 수익을 함께 확인하고 나에게 맞는 프로젝트에 참여할 수 있습니다."
      />
      <ProjectsExplorer />
      <GreenBand text="함께 키우는 도심의 미래, 지금 프로젝트에 참여하세요" />
    </main>
  );
}
