// 파일럿 라운드 개요 + 4-마일스톤 트랜치 표. v18 §3의 핵심을 에디토리얼 표로 구성.
export function PilotRound() {
  const tranches: [string, string, string, string][] = [
    ["01", "공간 준비", "35%", "협약서 OCR · 설비 영수증 · 현장 사진 교차검증"],
    ["02", "시운전", "30%", "IoT 14일 가동률 90% 이상"],
    ["03", "첫 수확·판매", "20%", "수확 사진 · 판매 데이터"],
    ["04", "지속 운영", "15%", "IoT 60일 · 복수 판매 실적"],
  ];

  return (
    <div className="pilot">
      <div className="pilot-facts">
        <div>
          <b>5</b>
          <span>파일럿 사이트</span>
        </div>
        <div>
          <b>2.2억</b>
          <span>라운드 조달 규모</span>
        </div>
        <div>
          <b>부산</b>
          <span>1호점 단독 실증 후 순차 개설</span>
        </div>
      </div>

      <div className="tranche-table" role="table" aria-label="마일스톤 트랜치">
        <div className="tranche-row tranche-head" role="row">
          <span role="columnheader">단계</span>
          <span role="columnheader">마일스톤</span>
          <span role="columnheader" className="tranche-pct">집행</span>
          <span role="columnheader">검증 신호</span>
        </div>
        {tranches.map(([no, name, pct, sig]) => (
          <div className="tranche-row" role="row" key={no}>
            <span className="tranche-no" role="cell">
              {no}
            </span>
            <span className="tranche-name" role="cell">
              {name}
            </span>
            <span className="tranche-pct" role="cell">
              {pct}
            </span>
            <span className="tranche-sig muted" role="cell">
              {sig}
            </span>
          </div>
        ))}
      </div>

      <p className="pilot-note muted">
        각 단계 검증을 통과할 때만 에스크로가 트랜치를 집행합니다. 180일 데드라인
        경과 시 누구나 실패 전환을 트리거해 환불 모드로 넘길 수 있습니다.
      </p>
    </div>
  );
}
