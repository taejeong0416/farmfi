import Link from "next/link";
import {
  Flow,
  GreenBand,
  Hero,
  RoleCards,
  Section,
  Stats,
} from "@/components/FarmFi";

export default function HomePage() {
  return (
    <main className="page">
      <Hero
        eyebrow="공실 진단 · 운영자 배정 · 생육-판매 연동"
        title="도심 유휴공간을 24시간 신선매장으로"
        green="공실전환 창업 지원 인프라"
        lead="기관의 유휴공간을 스마트팜 매장으로 전환하고, 운영자를 모집·배정하며, 생육 모니터링과 성과관리를 제공합니다."
        actions={
          <>
            <Link className="btn" href="/operator">
              운영자 지원하기 →
            </Link>
            <Link className="ghost" href="/space">
              공간 등록하기 →
            </Link>
          </>
        }
        chips={["부산광역시", "공실전환", "생육-판매 연동"]}
      />
      <Section title="FarmFi는 이렇게 연결됩니다">
        <RoleCards />
      </Section>
      <Section title="도시 유휴공간이 수익 농장으로 바뀌는 과정">
        <Flow />
      </Section>
      <Section title="플랫폼 현황">
        <Stats />
      </Section>
      <GreenBand />
    </main>
  );
}
