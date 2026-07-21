import Link from "next/link";
import { Icon } from "../ui/Icon";

// 보조 진입점 — 공간을 제공하는 기관·지자체와 건물주.
export function SpaceProviders() {
  const roles: [string, string, string, string, string][] = [
    [
      "기관·지자체",
      "유휴공간을 24시간 신선매장으로 전환하고 공실전환 성과를 리포트로 확보하세요.",
      "building",
      "제휴 문의",
      "#contact",
    ],
    [
      "건물주",
      "비어 있는 상가를 등록하고 안정적인 임대 수익을 받으세요.",
      "building",
      "공간 등록",
      "/space",
    ],
  ];

  return (
    <div className="grid-2">
      {roles.map(([title, desc, icon, link, href]) => (
        <article className="card role-card soft-card" key={title}>
          <div className="role-head">
            <span className="icon">
              <Icon name={icon} />
            </span>
            <h3>{title}</h3>
          </div>
          <p>{desc}</p>
          <Link className="link" href={href}>
            {link} →
          </Link>
        </article>
      ))}
    </div>
  );
}
