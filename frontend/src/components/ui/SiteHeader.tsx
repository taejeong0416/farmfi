"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader, isBareRoute, type NavItem } from "./AppHeader";
import { useAuth } from "@/lib/useAuth";

type Shell = {
  nav: NavItem[];
  badge?: { text: string; as: "pill" | "text"; tone?: "investor" | "operator" };
};

const PUBLIC: Shell = {
  nav: [
    { label: "홈", href: "/" },
    { label: "정기구독하기", href: "/subscribe" },
    { label: "투자자 시작하기", href: "/projects" },
    { label: "운영자 시작하기", href: "/operator/spaces" },
  ],
};

const INVESTOR: Shell = {
  badge: { text: "투자자 포털", as: "pill", tone: "investor" },
  nav: [
    { label: "프로젝트", href: "/projects" },
    { label: "내 투자", href: "/investor" },
    { label: "알림", href: "/investor/notifications" },
  ],
};

const OPERATOR: Shell = {
  badge: { text: "운영자 포털", as: "pill", tone: "operator" },
  nav: [
    { label: "공간 찾기", href: "/operator/spaces" },
    { label: "내 준비 현황", href: "/operator" },
    { label: "보증서", href: "/operator/certificate" },
  ],
};

const BUYER: Shell = {
  nav: [
    { label: "정기구독", href: "/subscribe" },
    { label: "내 구독", href: "/subscriptions" },
  ],
};

const ADMIN: Shell = { nav: [], badge: { text: "관리자 콘솔", as: "text" } };

function shellFor(pathname: string): Shell | null {
  if (isBareRoute(pathname)) return null;
  if (pathname.startsWith("/admin")) return ADMIN;
  if (pathname.startsWith("/investor") || pathname.startsWith("/projects")) {
    return INVESTOR;
  }
  if (pathname.startsWith("/operator")) return OPERATOR;
  if (pathname.startsWith("/subscribe") || pathname.startsWith("/subscriptions")) {
    return BUYER;
  }
  return PUBLIC;
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const shell = shellFor(pathname);
  const returnTo = useReturnTo(pathname);

  if (!shell) return null;

  const isAdmin = shell === ADMIN;
  const next = encodeURIComponent(returnTo);

  return (
    <AppHeader
      nav={shell.nav}
      badge={shell.badge}
      right={
        isLoading ? null : isAuthenticated ? (
          <div className="flex items-center gap-3">
            <span className="text-12 text-body">{user?.name}</span>
            {isAdmin ? null : (
              <button
                type="button"
                onClick={() => void logout()}
                className="h-9 rounded-6 border border-line px-4 text-12 font-medium text-ink hover:bg-surface"
              >
                로그아웃
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link
              href={`/signup?next=${next}`}
              className="text-13 text-body hover:text-ink"
            >
              회원가입
            </Link>
            <Link
              href={`/login?next=${next}`}
              className="flex h-[35px] items-center rounded-6 border border-line px-4 text-12 font-medium text-ink hover:bg-surface"
            >
              로그인
            </Link>
          </div>
        )
      }
    />
  );
}

/**
 * 로그인 뒤 돌아올 자리. 보던 화면을 그대로 돌려주려면 쿼리까지 있어야 한다
 * (`/projects/x/invest/eligibility?amount=10000`).
 *
 * `useSearchParams`를 쓰지 않는 이유는 이 헤더가 루트 레이아웃에 있기 때문이다.
 * 거기서 그 훅을 부르면 모든 화면이 정적 렌더링에서 빠진다. 첫 렌더는 경로만 쓰고,
 * 하이드레이션 뒤에 쿼리를 붙인다.
 */
function useReturnTo(pathname: string): string {
  const [returnTo, setReturnTo] = useState(pathname);
  useEffect(() => {
    setReturnTo(window.location.pathname + window.location.search);
  }, [pathname]);
  return returnTo;
}
