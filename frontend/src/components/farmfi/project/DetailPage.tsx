"use client";

import { Section } from "../ui/Section";
import { Metric } from "../ui/Metric";

export function DetailPage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="thumb detail">
          <div className="shell" style={{ paddingTop: 210, color: "#fff" }}>
            <span className="badge">운영 중</span>
            <h1 style={{ marginTop: 18 }}>해운대 커뮤니티팜</h1>
            <p className="lead" style={{ color: "rgba(255,255,255,.9)" }}>
              부산광역시 해운대구 마린시티 2로 38, Rooftop Farm
            </p>
          </div>
        </div>
      </section>
      <div className="shell grid-2 section">
        <div>
          <Section title="함께 만드는 지속가능한 가치">
            <div className="grid-3">
              <Metric label="건물주" value="공간 제공" />
              <Metric label="운영자" value="재배 운영" />
              <Metric label="투자자" value="수익 참여" />
            </div>
          </Section>
          <Section title="IoT 실시간 환경 데이터">
            <div className="stats-grid">
              <Metric label="온도" value="24.6℃" />
              <Metric label="습도" value="62%" />
              <Metric label="CO₂" value="412ppm" />
              <Metric label="조도" value="320" />
              <Metric label="pH" value="6.2" />
            </div>
          </Section>
        </div>
        <aside>
          <article className="card report-card">
            <p className="muted">최소 참여 금액</p>
            <p className="big-number">₩100,000</p>
            <div className="grid-2">
              <Metric label="예상 연 수익률" value="8.6%" />
              <Metric label="예상 수익" value="₩8,600" />
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 18 }}>
              지금 참여하기
            </button>
            <button className="outline" style={{ width: "100%", marginTop: 10 }}>
              관심 등록
            </button>
          </article>
          <article className="card report-card" style={{ marginTop: 20 }}>
            <h3>프로젝트 상태</h3>
            <ul className="timeline">
              {["프로젝트 등록", "운영 준비 완료", "모집 시작", "모집 진행 중", "자금 집행 예정"].map((item) => (
                <li key={item}>
                  <i />
                  {item}
                  <span>2024.05</span>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </div>
    </main>
  );
}
