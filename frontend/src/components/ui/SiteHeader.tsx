"use client";

import Link from "next/link";
import { AppHeader, type NavItem } from "./AppHeader";
import { useAuth, type AuthUserRole } from "@/lib/useAuth";

const PUBLIC_NAV: NavItem[] = [
  { label: "투자", href: "/projects" },
  { label: "정기구독", href: "/subscribe" },
  { label: "FarmFi 소개", href: "/about" },
];

// 로그인한 역할이 자기 화면으로 바로 들어가는 링크.
const ROLE_ENTRY: Partial<Record<AuthUserRole, NavItem>> = {
  investor: { label: "내 투자", href: "/investor" },
  operator: { label: "운영자 센터", href: "/operator" },
  landlord: { label: "내 공간", href: "/landlord" },
  admin: { label: "관리자 콘솔", href: "/admin" },
};

export function SiteHeader() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const entry = user ? ROLE_ENTRY[user.role] : undefined;

  const nav = entry ? [...PUBLIC_NAV, entry] : [...PUBLIC_NAV, { label: "운영자 시작", href: "/operator/spaces" }];

  return (
    <AppHeader
      nav={nav}
      right={
        isLoading ? null : isAuthenticated ? (
          <div className="flex items-center gap-3">
            <span className="text-12 text-body">{user?.name}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="h-9 rounded-6 border border-line px-4 text-12 font-medium text-ink hover:bg-surface"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/signup" className="text-13 text-body hover:text-ink">
              회원가입
            </Link>
            <Link
              href="/login"
              className="flex h-9 items-center rounded-6 border border-line px-4 text-12 font-medium text-ink hover:bg-surface"
            >
              로그인
            </Link>
          </div>
        )
      }
    />
  );
}
