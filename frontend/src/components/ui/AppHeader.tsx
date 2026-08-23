"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = { label: string; href: string };

/**
 * 로그인·회원가입·본인확인은 사진 위에 패널만 놓인 단독 화면이다 (`AuthShell`).
 * 내비도 푸터도 `.fig`에 없다.
 */
export const BARE_ROUTES = ["/login", "/signup", "/start", "/verify"];

export function isBareRoute(pathname: string): boolean {
  return BARE_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** 모든 화면 상단의 같은 자리. Figma 기준 높이 64, 아래 1px 선. */
export function AppHeader({
  nav = [],
  badge,
  right,
}: {
  nav?: NavItem[];
  /** 로고 옆 역할 표시. 포털은 알약, 관리자 콘솔은 글자만. */
  badge?: { text: string; as: "pill" | "text"; tone?: "investor" | "operator" };
  right?: ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-shell items-center gap-8 px-[54px]">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="text-17 font-bold text-brand">
            FarmFi
          </Link>
          {badge?.as === "pill" ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[8px] font-semibold ${
                badge.tone === "operator"
                  ? "bg-accent-operator/10 text-accent-operator"
                  : "bg-accent-investor/10 text-accent-investor"
              }`}
            >
              {badge.text}
            </span>
          ) : badge ? (
            <span className="text-14 font-medium text-brand">{badge.text}</span>
          ) : null}
        </div>
        <nav className="flex flex-1 items-center gap-6">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-14 ${
                  active ? "font-medium text-brand" : "text-body hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {right}
      </div>
    </header>
  );
}

export function AppFooter() {
  const pathname = usePathname() ?? "/";
  if (isBareRoute(pathname)) return null;

  return (
    <footer className="mt-20 border-t border-line-soft bg-white">
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-4 px-8 py-8">
        <div>
          <p className="text-13 font-bold text-brand">FarmFi</p>
          <p className="mt-2 text-11 text-muted">
            도심 유휴공실을 스마트팜 매장으로 전환하는 자금을 모으고, 검증된 단계에만 집행합니다.
          </p>
        </div>
        <p className="text-11 text-muted">
          투자 원금은 보장되지 않습니다. 투자 전 계약 조건과 위험을 확인하세요.
        </p>
      </div>
    </footer>
  );
}

/** 1440 본문 폭. 화면 본문을 감싸는 기본 컨테이너. 좌우 54는 `.fig` 전 화면 공통이다. */
export function Shell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto max-w-shell px-[54px] py-6 ${className ?? ""}`}>
      {children}
    </main>
  );
}

/** 730 패널 폭. 신청·결제처럼 한 줄기로 진행하는 화면에 쓴다. */
export function PanelShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto max-w-panel px-6 py-10 ${className ?? ""}`}>
      {children}
    </main>
  );
}
