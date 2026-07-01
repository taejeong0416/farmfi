import { Icon } from "../ui/Icon";

export function Flow() {
  const steps = [
    ["유휴공간 발굴", "도심 유휴공간을 발굴하고 등록합니다.", "building"],
    ["운영자 매칭", "전문 운영자와 매칭해 계획을 수립합니다.", "user"],
    ["프로젝트 개설", "투자자를 모집하고 계약을 공개합니다.", "chart"],
    ["재배 / 운영", "IoT 데이터로 안전하게 운영합니다.", "leaf"],
    ["수확 / 분배", "수익을 투명하게 분배합니다.", "coin"],
  ];
  return (
    <div className="card flow">
      {steps.map(([title, desc, icon]) => (
        <div className="flow-step" key={title}>
          <span className="icon">
            <Icon name={icon} />
          </span>
          <h3>{title}</h3>
          <p className="muted">{desc}</p>
        </div>
      ))}
    </div>
  );
}
