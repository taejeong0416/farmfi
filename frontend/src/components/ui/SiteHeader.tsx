"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader, type NavItem } from "./AppHeader";
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

/** 로그인·회원가입·본인확인은 내비 없는 단독 패널이다. */
const BARE = ["/login", "/signup", "/start", "/verify"];

function shellFor(pathname: string): Shell | null {
  if (BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
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

  if (!shell) return null;

  const isAdmin = shell === ADMIN;

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
            <Link href="/signup" className="text-13 text-body hover:text-ink">
              회원가입
            </Link>
            <Link
              href="/login"
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
