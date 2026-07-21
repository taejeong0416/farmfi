import { ProjectsGrid, Section } from "@/components/FarmFi";

export const metadata = {
  title: "투자 프로젝트 | FarmFi",
};

export default function ProjectsPage() {
  return (
    <main className="page">
      <Section
        title="투자 가능한 스마트팜"
        desc="검증된 마일스톤에 따라 코드가 자금을 단계 집행합니다. 배당은 개설된 사이트들의 플랫폼 수수료 풀에서 나옵니다."
      >
        <ProjectsGrid />
      </Section>
    </main>
  );
}
