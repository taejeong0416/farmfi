export function Flow() {
  const steps = [
    ["공간 진단·선별", "전기·급배수·층고·입지를 진단해 전환 가능 공실만 선별합니다."],
    ["운영자 모집·배정", "지점별 운영자를 모집해 1공간 1운영자로 배정합니다."],
    ["생육 모니터링", "설비 센서 데이터로 생육 현황과 이상을 실시간 확인합니다."],
    ["재고-판매 연동", "수확·보충 시점과 판매 추이를 한 화면에서 관리합니다."],
    ["성과 리포트", "공간활용·생산·판매 성과를 기관에 리포트로 제공합니다."],
  ];
  return (
    <div className="card flow">
      {steps.map(([title, desc], i) => (
        <div className="flow-step" key={title}>
          <span className="step-no">{String(i + 1).padStart(2, "0")}</span>
          <h3>{title}</h3>
          <p className="muted">{desc}</p>
        </div>
      ))}
    </div>
  );
}
