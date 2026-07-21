import Link from "next/link";
import { GreenBand, Hero, Panel, Section } from "@/components/FarmFi";

const BENEFITS: [string, string][] = [
  ["초기 설비 자본 없음", "설비 자금은 STO로 조달됩니다. 운영자는 매장을 운영하고 매출을 100% 소유합니다."],
  ["공간·설비 매칭", "입지 진단부터 모듈형 스마트팜 설비 셋업까지 FarmFi가 연결합니다."],
  ["전문 운영 교육", "재배 매뉴얼과 실무 교육으로 무경험자도 매장 운영을 시작할 수 있습니다."],
  ["생육·판매 연동 앱", "오늘 할 일·재고·수확·판매를 앱 하나로 관리합니다."],
];

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
            <Link className="ghost" href="#apply">
              합류 절차 보기
            </Link>
          </>
        }
        chips={["초기자금 부담 없음", "저노동 부업형", "든든한 운영 지원"]}
      />
      <Section
        no="01"
        title="운영 파트너 혜택"
        desc="초기 자본 부담 없이 시작하고, 도심 근로자 수준의 소득을 목표로 합니다."
      >
        <div className="grid-4">
          {BENEFITS.map(([title, desc]) => (
            <article className="card" style={{ padding: 22 }} key={title}>
              <h3 style={{ marginTop: 0 }}>{title}</h3>
              <p className="muted">{desc}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section no="02" title="운영자 지원 신청" id="apply">
        <div className="grid-2">
          <Panel title="지원서 제출">
            <p className="muted">
              희망 지역·재배 경험·운영 가능 시간을 적어 지원하면, 검토 후 공간
              매칭 절차를 안내드립니다.
            </p>
            <Link className="btn" href="/operator/apply" style={{ marginTop: 18, width: "100%" }}>
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
      <GreenBand text="지금 바로 FarmFi 운영 파트너로 첫 걸음을 시작하세요" />
    </main>
  );
}
