"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// 회원가입에서 자가배정 가능한 역할. "admin"은 자가배정 불가(시드 전용),
// "investor"는 레거시 데이터 호환용으로 타입에만 남긴다(신규 배정 불가).
export type AssignableRole = "landlord" | "operator";
export type AuthUserRole = AssignableRole | "admin" | "investor";

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

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  role: AssignableRole;
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

async function postAuth(
  path: "/api/auth/login" | "/api/auth/signup",
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
}

/**
 * 이메일+비밀번호 로그인/회원가입 + 세션 상태를 감싸는 클라이언트 훅.
 *
 * login(email, password): 서버 검증 → 세션 발급
 * signup({...}): 계정 생성 + 역할 확정 → 세션 발급
 * logout(): 서버 세션 종료
 * user/isLoading: GET /api/auth/me 기반 세션 상태 (react-query)
 */
export function useAuth() {
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

  const login = useCallback(
    async (email: string, password: string) => {
      await postAuth("/api/auth/login", { email, password });
      await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
    },
    [queryClient],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      await postAuth("/api/auth/signup", input);
      await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
    await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
  }, [queryClient]);

  // 마이페이지에서 역할을 바꿀 때 사용. 서버가 세션(JWT) 소유자 기준으로만
  // 갱신하므로 role은 항상 "내 계정"에만 적용된다.
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
    signup,
    logout,
    updateRole,
  };
}
