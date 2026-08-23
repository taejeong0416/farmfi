"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/useAuth";

// A-01 사이드바 15항목. A-05 구독·픽업 예외는 .fig에 도면이 없어 넣지 않는다.
// 마일스톤 설정(A-07)은 프로젝트를 고른 뒤 열리므로 목록을 거쳐 들어간다.
const NAV: { label: string; href: string; activeWhen: RegExp }[] = [
  { label: "콘솔 홈", href: "/admin", activeWhen: /^\/admin$/ },
  { label: "보증서 관리", href: "/admin/certificates", activeWhen: /^\/admin\/certificates/ },
  { label: "프로젝트 관리", href: "/admin/projects", activeWhen: /^\/admin\/projects$/ },
  { label: "마일스톤 설정", href: "/admin/projects", activeWhen: /^\/admin\/projects\/.+\/milestones/ },
  { label: "공간·설비 관리", href: "/admin/spaces", activeWhen: /^\/admin\/spaces/ },
  { label: "운영자 관리", href: "/admin/operators", activeWhen: /^\/admin\/operators/ },
  { label: "증빙 재검토", href: "/admin/evidence", activeWhen: /^\/admin\/evidence/ },
  { label: "외부전문가 판정", href: "/admin/expert-review", activeWhen: /^\/admin\/expert-review/ },
  { label: "정산 규칙 설정", href: "/admin/settlement-rules", activeWhen: /^\/admin\/settlement-rules/ },
  { label: "정산 결과", href: "/admin/settlements", activeWhen: /^\/admin\/settlements/ },
  { label: "감사 로그 조회", href: "/admin/audit-logs", activeWhen: /^\/admin\/audit-logs/ },
  { label: "권한 관리", href: "/admin/roles", activeWhen: /^\/admin\/roles/ },
  { label: "알림 발송", href: "/admin/notifications", activeWhen: /^\/admin\/notifications/ },
  { label: "AML · 이상거래 관리", href: "/admin/aml", activeWhen: /^\/admin\/aml/ },
  { label: "매출·비용 입력", href: "/admin/ledger", activeWhen: /^\/admin\/ledger/ },
];

/** 관리자 화면 공통 좌측 메뉴. 콘솔 안에서만 쓴다. */
export function AdminShell({
  label,
  title,
  desc,
  action,
  children,
}: {
  /** 본문 위에 놓이는 메뉴 이름. 생략하면 현재 경로의 메뉴 이름을 쓴다. */
  label?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { logout } = useAuth();
  const current = NAV.find((item) => item.activeWhen.test(pathname));

  return (
    <div className="mx-auto flex max-w-shell">
      <nav className="flex w-[195px] shrink-0 flex-col self-stretch border-r border-line-soft pt-6">
        <ul className="space-y-[18px] px-6">
          {NAV.map((item) => {
            const active = item === current;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`block text-12 ${
                    active ? "font-medium text-brand" : "text-body hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-auto px-6 pb-6 pt-12 text-left text-12 text-body hover:text-ink"
        >
          로그아웃
        </button>
      </nav>

      <main className="min-w-0 flex-1 px-[54px] py-6">
        <div className="mb-7 flex items-end justify-between gap-6">
          <div>
            <p className="text-14 font-medium text-brand">
              {label ?? current?.label}
            </p>
            <h1 className="mt-2 text-24 font-bold text-ink">{title}</h1>
            {desc ? <p className="mt-2 text-12 text-muted">{desc}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}
