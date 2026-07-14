import Link from "next/link";
import { DashboardShell, GreenBand, Hero, Metric, Panel, Section } from "@/components/FarmFi";

export default function OperatorPage() {
  return (
    <main className="page">
      <Hero
        art="operator"
        title="스마트팜 운영의 새로운 기회,"
        green="FarmFi 운영 파트너"
        lead="FarmFi는 공간·설비·운영 시스템을 연결해, 초기자금 부담 없이 스마트팜 매장을 시작하고 지속하도록 돕습니다."
        actions={
          <>
            <Link className="btn" href="/operator/apply">
              운영자 지원하기 →
            </Link>
            <Link className="ghost" href="/dashboard">
              대시보드 보기
            </Link>
          </>
        }
        chips={["초기자금 부담 없음", "저노동 부업형", "든든한 운영 지원"]}
      />
      <Section title="운영 파트너 혜택">
        <div className="grid-4">
          <Metric label="공간 매칭 지원" value="입지 분석" />
          <Metric label="전문 교육 제공" value="운영 매뉴얼" />
          <Metric label="생육-판매 연동" value="오늘 할 일" />
          <Metric label="커뮤니티 지원" value="네트워크" />
        </div>
      </Section>
      <Section title="운영자 지원 신청" id="apply">
        <div className="grid-2">
          <Panel title="지원서 제출">
            <p className="muted">
              희망 지역·재배 경험·운영 가능 시간을 적어 지원하면, 검토 후 공간
              매칭 절차를 안내드립니다.
            </p>
            <Link className="btn" href="/operator/apply" style={{ display: "block", textAlign: "center", marginTop: 18 }}>
              지원서 작성하러 가기 →
            </Link>
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
