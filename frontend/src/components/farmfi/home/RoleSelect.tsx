import Link from "next/link";
import { Icon } from "../ui/Icon";

// 홈의 핵심 — 역할을 크게 고르는 플로팅 카드. 서비스를 몰라도 '나는 무엇으로
// 참여하나'만 고르면 되도록.
const ROLES: {
  tag: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
  icon: string;
}[] = [
  {
    tag: "투자자",
    title: "조각투자로 참여",
    desc: "우리 동네 스마트팜 확장 라운드에 투자하고, 검증을 통과한 만큼만 집행되는 구조로 참여합니다.",
    cta: "투자 프로젝트 보기",
    href: "/projects",
    icon: "coin",
  },
  {
    tag: "운영자",
    title: "스마트팜 창업",
    desc: "초기 설비 자본 없이 도심 유휴공간에서 매장을 운영하고, 매출을 100% 소유합니다.",
    cta: "운영자 지원하기",
    href: "/operator",
    icon: "user",
  },
  {
    tag: "건물주·기관",
    title: "유휴공간 활용",
    desc: "비어 있는 옥상·점포·실내 공간을 24시간 신선매장으로 전환해 수익과 성과를 얻습니다.",
    cta: "공간 등록하기",
    href: "/space",
    icon: "building",
  },
];

export function RoleSelect() {
  return (
    <div className="role-select">
      {ROLES.map((r) => (
        <Link className="role-select-card" href={r.href} key={r.tag}>
          <span className="role-select-icon">
            <Icon name={r.icon} />
          </span>
          <span className="role-select-tag">{r.tag}</span>
          <strong>{r.title}</strong>
          <p>{r.desc}</p>
          <span className="role-select-cta">{r.cta} →</span>
        </Link>
      ))}
    </div>
  );
}
