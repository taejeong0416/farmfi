// 랜딩 플랫폼 현황 — v18 운영 지표 요약(정적). 실데이터 연동 UI는 후속.
export function Stats() {
  const stats: [string, string, string][] = [
    ["운영 지점", "2 개", "부산 동래 · 금정"],
    ["누적 생산량", "3,300+ 봉", "최근 30일 엽채류·허브"],
    ["재고-판매 연동", "실시간", "수확·보충·판매 추이"],
    ["ESG 임팩트", "탄소 절감", "지역 신선식품 공급"],
  ];

  return (
    <div className="stats-grid">
      {stats.map(([label, value, desc]) => (
        <article className="card metric" key={label}>
          <span className="muted">{label}</span>
          <strong>{value}</strong>
          <p className="muted">{desc}</p>
        </article>
      ))}
    </div>
  );
}
