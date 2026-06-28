import Link from "next/link";
import {
  Flow,
  GreenBand,
  Hero,
  MarketProducts,
  ProjectGrid,
  RoleCards,
  Section,
  Stats,
} from "@/components/FarmFi";

export default function HomePage() {
  return (
    <main className="page">
      <Hero
        eyebrow="공간 · 운영 · 투자 · 소비를 연결"
        title="도심 유휴공간을 함께 키우는"
        green="스마트팜 플랫폼"
        lead="건물주는 공간을 제공하고, 운영자는 농장을 운영합니다. 투자자는 프로젝트를 지원하고, 소비자는 신선한 농산물을 만납니다."
        actions={
          <>
            <Link className="btn" href="/projects">
              프로젝트 보기 →
            </Link>
            <Link className="ghost" href="/space">
              공간 등록하기 →
            </Link>
          </>
        }
        chips={["투명한 운영과 안전한 기록", "부산광역시", "BIFC", "Chainlink"]}
      />
      <Section title="FarmFi는 이렇게 연결됩니다">
        <RoleCards />
      </Section>
      <Section title="도시 유휴공간이 수익 농장으로 바뀌는 과정">
        <Flow />
      </Section>
      <Section title="주목할 만한 프로젝트" aside={<Link className="link" href="/projects">모든 프로젝트 보기 →</Link>}>
        <ProjectGrid limit={3} />
      </Section>
      <Section title="플랫폼 현황">
        <Stats />
      </Section>
      <Section title="지금, 가까운 미니팜에서 신선함을 만나보세요" aside={<Link className="link" href="/market">마켓 더 보기 →</Link>}>
        <MarketProducts />
      </Section>
      <GreenBand />
    </main>
  );
}
