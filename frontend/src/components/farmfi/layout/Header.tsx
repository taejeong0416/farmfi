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
      <div className="shell nav-inner">
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

              // Avoid hydration mismatch: render nothing meaningful until mounted.
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

              // Only trust the session as "logged in" when it matches the
              // currently connected wallet (guards against stale sessions
              // after switching accounts).
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
      </div>
    </header>
  );
}
