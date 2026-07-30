"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth, type AuthUserRole } from "@/lib/useAuth";
import { NotificationBell } from "./NotificationBell";

const nav = [
  ["홈", "/"],
  ["서비스 소개", "/about"],
  ["투자하기", "/projects"],
  ["운영자 모집", "/operator"],
  ["문의하기", "#contact"],
];

// 로그인 역할별 전용 화면 진입점. 링크가 없으면 URL을 직접 쳐야 도달한다.
const ROLE_ENTRY: Partial<Record<AuthUserRole, { label: string; href: string }>> = {
  landlord: { label: "내 공간", href: "/landlord" },
  operator: { label: "운영자 센터", href: "/operator" },
  admin: { label: "관리자 콘솔", href: "/admin" },
};

// 운영 알림은 지점을 실제로 다루는 역할에게만 노출한다.
const NOTIFY_ROLES: AuthUserRole[] = ["admin", "operator"];

export function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const closeMobile = () => setIsMobileOpen(false);

  const handleLogout = async () => {
    setAuthError(null);
    try {
      await logout();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "로그아웃에 실패했습니다.",
      );
    }
  };

  const accountLabel = user?.name ?? "내 정보";
  const roleEntry = user ? ROLE_ENTRY[user.role] : undefined;
  const canSeeNotifications = Boolean(user && NOTIFY_ROLES.includes(user.role));

  // 로그인/회원가입 vs 내 정보/로그아웃 — 데스크톱·모바일 공통 렌더.
  const renderAuthNav = (onNavigate?: () => void) => {
    if (isLoading) return null;
    if (isAuthenticated) {
      return (
        <>
          {canSeeNotifications ? <NotificationBell onNavigate={onNavigate} /> : null}
          {roleEntry ? (
            <Link className="ghost" href={roleEntry.href} onClick={onNavigate}>
              {roleEntry.label}
            </Link>
          ) : null}
          <Link className="ghost" href="/mypage" onClick={onNavigate}>
            {accountLabel}
          </Link>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              handleLogout();
              onNavigate?.();
            }}
          >
            로그아웃
          </button>
        </>
      );
    }
    return (
      <>
        <Link className="ghost" href="/login" onClick={onNavigate}>
          로그인
        </Link>
        <Link className="btn" href="/signup" onClick={onNavigate}>
          회원가입
        </Link>
      </>
    );
  };

  return (
    <header className="nav">
      <div className="shell">
        <div className="nav-inner">
          <Link className="logo" href="/" aria-label="FarmFi 홈">
            <Image
              src="/assets/farmfi-logo.png"
              alt="FarmFi"
              width={154}
              height={41}
              className="logo-img"
              priority
            />
          </Link>
          <nav className="nav-links" aria-label="주요 메뉴">
            {nav.map(([label, href]) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  href={href}
                  key={label}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="nav-actions">
            {authError && (
              <span className="muted" role="alert">
                {authError}
              </span>
            )}
            {renderAuthNav()}
          </div>

          {/* Hamburger — visible only below 980px via CSS */}
          <button
            className="nav-hamburger"
            type="button"
            aria-label={isMobileOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={isMobileOpen}
            onClick={() => setIsMobileOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {/* Mobile drawer */}
        {isMobileOpen && (
          <nav className="nav-mobile-menu" aria-label="모바일 메뉴">
            {nav.map(([label, href]) => (
              <Link href={href} key={label} onClick={closeMobile}>
                {label}
              </Link>
            ))}
            <div className="nav-mobile-actions">
              {authError && (
                <span className="muted" role="alert">
                  {authError}
                </span>
              )}
              {renderAuthNav(closeMobile)}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
