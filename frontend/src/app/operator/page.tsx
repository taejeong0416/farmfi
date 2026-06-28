import Link from "next/link";
import { DashboardShell, GreenBand, Hero, Metric, Panel, Section } from "@/components/FarmFi";

export default function OperatorPage() {
  return (
    <main className="page">
      <Hero
        art="operator"
        title="스마트팜 운영의 새로운 기회,"
        green="FarmFi 운영 파트너"
        lead="FarmFi는 공간, 기술, 자본을 연결하고 운영 파트너와 함께 스마트한 지속가능 농업 생태계를 만들어갑니다."
        actions={
          <>
            <Link className="btn" href="#apply">
              운영자 지원하기 →
            </Link>
            <Link className="ghost" href="/dashboard">
              대시보드 보기
            </Link>
          </>
        }
        chips={["검증된 플랫폼", "지속가능한 수익", "든든한 파트너십"]}
      />
      <Section title="운영 파트너 혜택">
        <div className="grid-4">
          <Metric label="공간 매칭 지원" value="입지 분석" />
          <Metric label="전문 교육 제공" value="운영 매뉴얼" />
          <Metric label="수익 참여" value="성과 기반" />
          <Metric label="커뮤니티 지원" value="네트워크" />
        </div>
      </Section>
      <Section title="운영자 지원 신청">
        <div className="grid-2" id="apply">
          <Panel title="지원서 제출">
            {["이름 / 팀명", "희망 지역", "재배 경험", "운영 가능 시간", "전문 분야"].map((item) => (
              <div className="fake-control" style={{ marginTop: 12 }} key={item}>
                {item}
              </div>
            ))}
            <button className="btn" style={{ width: "100%", marginTop: 18 }}>
              지원서 제출하기
            </button>
          </Panel>
          <Panel title="운영 파트너 합류 절차">
            {["지원서 제출", "서류/인터뷰", "운영 교육", "공간 매칭", "운영 시작"].map((item, i) => (
              <p className="muted" key={item}>
                0{i + 1} · {item}
              </p>
            ))}
          </Panel>
        </div>
      </Section>
      <DashboardShell operator />
      <GreenBand text="지금 바로 FarmFi 운영 파트너로 첫 걸음을 시작하세요" />
    </main>
  );
}
