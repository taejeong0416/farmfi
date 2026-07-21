import Link from "next/link";

// 랜딩의 두 주력 퍼널 — 투자자(STO 청약)와 운영자 모집.
export function Funnels() {
  return (
    <div className="funnels">
      <article className="card funnel-card">
        <span className="funnel-tag">투자자</span>
        <h3>우리 동네 가게의 지분을 갖는 조각투자</h3>
        <p className="muted">
          개별 농장이 아니라 확장 라운드에 투자합니다. 검증을 통과할 때만 코드가
          자금을 단계 집행하고, 배당은 운영자 매출이 아닌 플랫폼 수수료 풀에서
          나옵니다.
        </p>
        <ul className="funnel-points">
          <li>4단계 마일스톤 검증 집행</li>
          <li>원금 보장 아님 · 참고수익률 정직 공시</li>
          <li>동네 단골이 곧 투자자</li>
        </ul>
        <Link className="btn" href="/projects">
          투자 프로젝트 보기 →
        </Link>
      </article>

      <article className="card funnel-card">
        <span className="funnel-tag">운영자</span>
        <h3>초기 설비 자본 없이 시작하는 스마트팜 창업</h3>
        <p className="muted">
          설비 자금은 STO로 조달됩니다. 운영자는 도심 유휴공간 매장을 운영하고
          매출을 100% 소유하며, 도심 근로자 수준의 소득을 목표로 합니다.
        </p>
        <ul className="funnel-points">
          <li>설비 자본 부담 없음</li>
          <li>매출 100% 운영자 소유</li>
          <li>재배·재고·판매 연동 SW 지원</li>
        </ul>
        <Link className="btn" href="/operator">
          운영자 지원하기 →
        </Link>
      </article>
    </div>
  );
}
