import Link from "next/link";
import { GreenBand, RoleSelect } from "@/components/FarmFi";

export default function HomePage() {
  return (
    <main className="page home">
      <section className="home-hero">
        <div className="shell">
          <span className="eyebrow">도심 유휴공간 스마트팜 · STO 조각투자</span>
          <h1>
            어떤 역할로
            <br />
            <strong>함께하시나요?</strong>
          </h1>
          <p className="lead">
            도심 유휴 상가를 스마트팜 매장으로 바꾸고, 확장 자금은 STO로
            조달합니다. 투자금은 검증을 통과할 때만 단계 집행됩니다.
          </p>
          <Link className="home-about-link" href="/about">
            FarmFi가 처음이신가요? 서비스 소개 보기 →
          </Link>
        </div>
      </section>

      <div className="shell">
        <RoleSelect />
      </div>

      <section className="section">
        <div className="shell home-highlights">
          <Link href="/about" className="home-highlight">
            <b>4단계 검증 집행</b>
            <span>공간 준비 → 시운전 → 첫 수확 → 지속 운영, 통과할 때만 집행</span>
          </Link>
          <Link href="/about" className="home-highlight">
            <b>정직한 공시</b>
            <span>원금 보장 아님 · 참고수익률 · 취약점까지 먼저 공개</span>
          </Link>
          <Link href="/about" className="home-highlight">
            <b>부산 파일럿</b>
            <span>5개 사이트 · 2.2억 — 1호점 실증 후 순차 개설</span>
          </Link>
        </div>
      </section>

      <GreenBand />
    </main>
  );
}
