"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/lib/useAuth";
import { shortenHash } from "@/lib/format";

const nav = [
  ["서비스 소개", "/"],
  ["프로젝트", "/projects"],
  ["공간 등록", "/space"],
  ["운영자 지원", "/operator"],
  ["투명성", "/transparency"],
  ["마켓", "/market"],
  ["문의하기", "#contact"],
];

export function Header() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const closeMobile = () => setIsMobileOpen(false);

  const handleLogin = async () => {
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      await login();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "로그인에 실패했습니다.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

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
            {nav.map(([label, href]) => (
              <Link href={href} key={label}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            {authError && (
              <span className="muted" role="alert">
                {authError}
              </span>
            )}
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openConnectModal,
                openAccountModal,
                openChainModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;

                if (!ready) {
                  return (
                    <button className="btn" type="button" disabled aria-hidden>
                      지갑 연결
                    </button>
                  );
                }

                if (!connected) {
                  return (
                    <button
                      className="btn"
                      type="button"
                      onClick={openConnectModal}
                    >
                      지갑 연결
                    </button>
                  );
                }

                if (chain.unsupported) {
                  return (
                    <button
                      className="ghost"
                      type="button"
                      onClick={openChainModal}
                    >
                      네트워크 전환
                    </button>
                  );
                }

                const sessionMatchesWallet =
                  isAuthenticated &&
                  user?.walletAddress?.toLowerCase() ===
                    account.address.toLowerCase();

                return (
                  <>
                    <button
                      className="ghost"
                      type="button"
                      onClick={openAccountModal}
                    >
                      {sessionMatchesWallet && user?.name
                        ? user.name
                        : shortenHash(account.address)}
                    </button>
                    {sessionMatchesWallet ? (
                      <button
                        className="ghost"
                        type="button"
                        onClick={handleLogout}
                      >
                        로그아웃
                      </button>
                    ) : (
                      <button
                        className="btn"
                        type="button"
                        onClick={handleLogin}
                        disabled={isLoggingIn || isLoading}
                      >
                        {isLoggingIn ? "로그인 중..." : "로그인"}
                      </button>
                    )}
                  </>
                );
              }}
            </ConnectButton.Custom>
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
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  openConnectModal,
                  openAccountModal,
                  openChainModal,
                  mounted,
                }) => {
                  if (!mounted) return null;
                  const connected = account && chain;

                  if (!connected) {
                    return (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          openConnectModal();
                          closeMobile();
                        }}
                      >
                        지갑 연결
                      </button>
                    );
                  }

                  if (chain.unsupported) {
                    return (
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => {
                          openChainModal();
                          closeMobile();
                        }}
                      >
                        네트워크 전환
                      </button>
                    );
                  }

                  const sessionMatchesWallet =
                    isAuthenticated &&
                    user?.walletAddress?.toLowerCase() ===
                      account.address.toLowerCase();

                  return (
                    <>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => {
                          openAccountModal();
                          closeMobile();
                        }}
                      >
                        {sessionMatchesWallet && user?.name
                          ? user.name
                          : shortenHash(account.address)}
                      </button>
                      {sessionMatchesWallet ? (
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => {
                            handleLogout();
                            closeMobile();
                          }}
                        >
                          로그아웃
                        </button>
                      ) : (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            handleLogin();
                            closeMobile();
                          }}
                          disabled={isLoggingIn || isLoading}
                        >
                          {isLoggingIn ? "로그인 중..." : "로그인"}
                        </button>
                      )}
                    </>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
