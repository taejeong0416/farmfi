import { Icon } from "../ui/Icon";

export function RoleCards() {
  const roles = [
    ["투자자", "도심 농업 프로젝트에 투자하고 수익을 얻으세요.", "chart", "투자 프로젝트 보기"],
    ["건물주", "유휴공간을 등록하고 안정적인 임대 수익을 받으세요.", "building", "유휴공간 등록"],
    ["운영자", "스마트팜을 운영하고 지속가능한 농업을 실현하세요.", "user", "운영자 지원"],
    ["소비자", "내 주변 미니팜의 신선한 농산물을 만나보세요.", "cart", "근처 미니팜 보기"],
  ];

  return (
    <div className="grid-4">
      {roles.map(([title, desc, icon, link]) => (
        <article className="card role-card soft-card" key={title}>
          <span className="icon">
            <Icon name={icon} />
          </span>
          <h3>{title}</h3>
          <p>{desc}</p>
          <a className="link" href="#next">
            {link} →
          </a>
        </article>
      ))}
    </div>
  );
}
