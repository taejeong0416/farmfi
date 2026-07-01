"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { polygonAmoy } from "wagmi/chains";
import { SiweMessage } from "siwe";

// 서버가 회원가입에서 직접 선택 가능한 역할. "admin"은 자가배정 불가(시드 전용).
export type AssignableRole = "investor" | "landlord" | "operator";
export type AuthUserRole = AssignableRole | "admin";

export type TokenHoldingSummary = {
  projectId: string;
  projectName: string;
  tokenSymbol: string;
  amount: number;
  avgPrice: number;
};

export type AuthUser = {
  id: string;
  name: string;
  role: AuthUserRole;
  email: string | null;
  walletAddress: string | null;
  // ─── 신원 인증 / 투자 자격 (OpenDID 연동, /verify-identity 흐름) ───
  identityVerified: boolean;
  verifiedAt: string | null;
  realName: string | null;
  investorAnnualLimit: number | null;
  businessRegNo: string | null;
  tokenHoldings: TokenHoldingSummary[];
};

const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });

  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error("세션 정보를 불러오지 못했습니다.");
  }

  const data = (await res.json()) as { user: AuthUser | null };
  return data.user ?? null;
}

async function patchRole(role: AssignableRole): Promise<AuthUser> {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    throw new Error("역할 저장에 실패했습니다.");
  }
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

/**
 * SIWE(Sign-In with Ethereum) 로그인 플로우 + 세션 상태를 감싸는 클라이언트 훅.
 *
 * login(): nonce 발급 → SIWE 메시지 서명 → 서버 검증
 * logout(): 서버 세션 종료
 * user/isLoading: GET /api/auth/me 기반 세션 상태 (react-query)
 */
export function useAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchCurrentUser,
    retry: false,
  });

  const login = useCallback(async () => {
    if (!address) {
      throw new Error("지갑을 먼저 연결해주세요.");
    }

    const nonceRes = await fetch("/api/auth/siwe/nonce", {
      credentials: "include",
    });
    if (!nonceRes.ok) {
      throw new Error("로그인 nonce 발급에 실패했습니다.");
    }
    const { nonce } = (await nonceRes.json()) as { nonce: string };

    const siweMessage = new SiweMessage({
      domain: window.location.host,
      address,
      statement: "FarmFi에 로그인합니다.",
      uri: window.location.origin,
      version: "1",
      chainId: polygonAmoy.id,
      nonce,
      // 서명 만료(10분) — 무기한 유효 서명 재사용 방지. 서버 verify가 time으로 검증.
      expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    const message = siweMessage.prepareMessage();
    const signature = await signMessageAsync({ message });

    const verifyRes = await fetch("/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message, signature }),
    });
    if (!verifyRes.ok) {
      throw new Error("로그인 검증에 실패했습니다.");
    }

    await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
  }, [address, signMessageAsync, queryClient]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
    await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
  }, [queryClient]);

  // 회원가입 온보딩에서 역할을 확정할 때 사용. 서버가 세션(JWT)의 소유자
  // 기준으로만 갱신하므로 role은 항상 "내 계정"에만 적용된다.
  const updateRole = useCallback(
    async (role: AssignableRole) => {
      const updated = await patchRole(role);
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, updated);
      return updated;
    },
    [queryClient],
  );

  return {
    user: user ?? null,
    isAuthenticated: Boolean(user),
    isLoading: isLoading || isFetching,
    login,
    logout,
    updateRole,
  };
}
