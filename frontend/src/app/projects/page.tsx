import Link from "next/link";
import { FilterBar, GreenBand, Hero, Metric, ProjectGrid, Section } from "@/components/FarmFi";

export default function ProjectsPage() {
  return (
    <main className="page">
      <Hero
        art="project"
        title="도심 미니팜 프로젝트 둘러보기"
        lead="다양한 도심 미니팜 프로젝트를 한눈에 비교해보세요. 공간, 운영자, 임팩트, 기대 수익을 함께 확인하고 나에게 맞는 프로젝트에 참여할 수 있습니다."
        chips={["전체 프로젝트 48개", "모집중 21개", "평균 예상 수익률 12.4%"]}
      />
      <Section title="프로젝트 검색">
        <FilterBar />
        <div className="stats-grid">
          <Metric label="전체 프로젝트 수" value="48개" />
          <Metric label="모집중 프로젝트" value="21개" />
          <Metric label="평균 예상 수익률" value="12.4%" />
          <Metric label="누적 투자금" value="₩18,426,860,000" />
          <Metric label="등록 공간 수" value="76개" />
        </div>
      </Section>
      <Section title="모집 중인 프로젝트" aside={<Link className="link" href="/projects/haeundae">대표 프로젝트 보기 →</Link>}>
        <ProjectGrid />
      </Section>
      <GreenBand text="함께 키우는 도심의 미래, 지금 프로젝트에 참여하세요" />
    </main>
  );
}
