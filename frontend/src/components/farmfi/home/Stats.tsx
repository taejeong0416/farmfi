// 랜딩 플랫폼 현황 — v18 운영 지표 요약(정적). 실데이터 연동 UI는 후속.
export function Stats() {
  const stats: [string, string, string][] = [
    ["운영 지점", "2곳", "부산 동래 · 금정"],
    ["누적 생산량", "3,300+ 봉", "최근 30일 엽채류·허브"],
    ["모집 중 라운드", "3호점", "920구좌 · 마일스톤 4단계"],
    ["자금 집행 방식", "4단계 트랜치", "검증 통과 시에만 집행"],
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
