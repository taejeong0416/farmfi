import Link from "next/link";
import {
  Flow,
  GreenBand,
  Hero,
  PilotRound,
  Section,
  Stats,
} from "@/components/FarmFi";

export const metadata = {
  title: "서비스 소개 | FarmFi",
};

export default function AboutPage() {
  return (
    <main className="page">
      <Hero
        eyebrow="서비스 소개"
        title="검증되지 않으면"
        green="집행되지 않는다"
        lead="도심 유휴 상가를 청년 창업자의 스마트팜 매장으로 바꾸고, 확장 자금은 STO로 조달합니다. 투자금은 4단계 마일스톤 검증을 통과할 때만 스마트컨트랙트가 단계 집행합니다."
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
        chips={["부산광역시", "파일럿 5개 사이트", "검증 기반 집행"]}
      />

      <Section
        no="01"
        title="파일럿 라운드"
        desc="1호점을 단독 실증하고 실측 지표를 공개한 뒤에만 나머지 사이트를 순차 모집합니다."
      >
        <PilotRound />
      </Section>

      <Section
        no="02"
        title="검증이 자금을 집행합니다"
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
      </Section>

      <Section
        no="03"
        title="도시 유휴공간이 수익 농장으로 바뀌는 과정"
      >
        <Flow />
      </Section>

      <Section title="플랫폼 현황">
        <Stats />
      </Section>

      <GreenBand />
    </main>
  );
}
