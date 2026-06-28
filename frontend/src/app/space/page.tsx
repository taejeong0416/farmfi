import Link from "next/link";
import { Flow, Hero, Metric, Section, SpaceForm } from "@/components/FarmFi";

export default function SpacePage() {
  return (
    <main className="page">
      <Hero
        art="space"
        eyebrow="공간 · 제공자 · 건물주 전용"
        title="유휴공간 등록하기"
        lead="사용하지 않는 옥상, 빈 점포, 실내 유휴공간을 스마트팜으로 전환하여 새로운 가치를 만들어보세요."
        actions={
          <>
            <Link className="btn" href="#form">
              공간 등록 시작 →
            </Link>
            <Link className="ghost" href="#benefit">
              혜택 보기
            </Link>
          </>
        }
        chips={["공간 가치 극대화", "안정적 임대 수익", "ESG 가치 실현"]}
      />
      <section className="section" id="form">
        <div className="shell">
          <SpaceForm />
        </div>
      </section>
      <Section title="공간 등록부터 프로젝트 오픈까지">
        <Flow />
      </Section>
      <Section title="건물주 대시보드 미리보기">
        <div className="stats-grid">
          <Metric label="등록 공간 수" value="3개" />
          <Metric label="현재 진행 프로젝트" value="2개" />
          <Metric label="계약 현황" value="2개" />
          <Metric label="누적 임대 수익" value="₩6,450,000" />
          <Metric label="진단 완료 공간" value="8개" />
        </div>
      </Section>
    </main>
  );
}
