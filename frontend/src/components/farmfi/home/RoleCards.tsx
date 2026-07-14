import Link from "next/link";
import { Icon } from "../ui/Icon";

export function RoleCards() {
  const roles = [
    ["기관·지자체", "유휴공간을 24시간 신선매장으로 전환하고 공실전환 성과를 확보하세요.", "building", "운영 현황 보기", "/dashboard"],
    ["건물주", "유휴공간을 등록하고 안정적인 임대 수익을 받으세요.", "building", "공간 등록", "/space"],
    ["운영자", "초기자금 부담 없이 스마트팜 매장을 운영하세요.", "user", "운영자 지원", "/operator"],
    ["설비 파트너", "모듈형 스마트팜 설비를 공급하고 유지보수 매출을 확보하세요.", "leaf", "파트너 문의", "#contact"],
  ];

  return (
    <div className="grid-4">
      {roles.map(([title, desc, icon, link, href]) => (
        <article className="card role-card soft-card" key={title}>
          <span className="icon">
            <Icon name={icon} />
          </span>
          <h3>{title}</h3>
          <p>{desc}</p>
          <Link className="link" href={href}>
            {link} →
          </Link>
        </article>
      ))}
    </div>
  );
}
