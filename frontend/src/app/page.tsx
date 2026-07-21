import Link from "next/link";
import {
  Flow,
  Funnels,
  GreenBand,
  Hero,
  Section,
  SpaceProviders,
  Stats,
} from "@/components/FarmFi";

export default function HomePage() {
  return (
    <main className="page">
      <Hero
        eyebrow="검증을 통과해야 자금이 집행되는 조각투자"
        title="유휴 상가를 스마트팜 매장으로,"
        green="확장 자금은 STO로 조달"
        lead="청년 창업자가 도심 공실을 스마트팜 매장으로 전환하고, 그 확장 자금을 STO로 조달합니다. 투자금은 한 번에 지급되지 않습니다 — 공간 준비부터 지속 운영까지, 단계별 검증을 통과할 때만 집행됩니다."
        actions={
          <>
            <Link className="btn" href="/projects">
              투자 프로젝트 보기 →
            </Link>
            <Link className="ghost" href="/operator">
              운영자 지원하기 →
            </Link>
          </>
        }
        chips={["부산광역시", "STO 조각투자", "검증 기반 집행"]}
      />
      <Section
        title="두 갈래로 시작합니다"
        desc="투자자로 참여하거나, 운영자로 창업하세요. FarmFi는 이 두 축을 연결하는 인프라입니다."
      >
        <Funnels />
      </Section>
      <Section
        title="확장 자금은 STO로, 집행은 코드로"
        desc="투자자는 개별 농장이 아니라 확장 라운드에 투자하고, 검증 결과에 따라 스마트컨트랙트가 자금을 단계 집행합니다. 배당은 개설된 사이트들의 플랫폼 수수료 풀에서 나옵니다."
      >
        <div className="grid-3">
          <article className="card" style={{ padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>4-마일스톤 트랜치</h3>
            <p className="muted">
              공간 준비 → 시운전 → 첫 수확·판매 → 지속 운영. 각 단계 검증을
              통과할 때만 에스크로가 트랜치를 집행합니다.
            </p>
          </article>
          <article className="card" style={{ padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>AI 멀티시그널 검증</h3>
            <p className="muted">
              계약서·영수증 OCR + 현장 사진 비전 + IoT 이상탐지. 교차검증을
              통과하면 추가 승인 없이 온체인 자동 집행됩니다.
            </p>
          </article>
          <article className="card" style={{ padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>수수료 풀 배당</h3>
            <p className="muted">
              배당은 플랫폼 수수료 풀에서만 나옵니다. 운영자 매출에는 손대지
              않아, 매장이 성장할수록 투자자와 운영자가 함께 이깁니다.
            </p>
          </article>
        </div>
        <div style={{ marginTop: 24 }}>
          <Link className="btn" href="/projects">
            투자 프로젝트 보기 →
          </Link>
        </div>
      </Section>
      <Section title="도시 유휴공간이 수익 농장으로 바뀌는 과정">
        <Flow />
      </Section>
      <Section
        title="공간을 제공하시나요?"
        desc="유휴공간을 가진 기관·지자체와 건물주를 위한 진입점입니다."
      >
        <SpaceProviders />
      </Section>
      <Section title="플랫폼 현황">
        <Stats />
      </Section>
      <GreenBand />
    </main>
  );
}
