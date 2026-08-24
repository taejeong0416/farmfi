import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSegments, type Href } from "expo-router";
import { apiFetch, setToken, clearToken, getToken } from "./api";

export type Role = "investor" | "operator" | "landlord" | "admin";
export type User = {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  // /api/auth/me 가 이미 내려주던 신원 필드. 본인인증 화면이 현재 상태를 읽는다.
  identityVerified?: boolean;
  realName?: string | null;
  verifiedAt?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: {
    name: string;
    email: string;
    password: string;
    role: Exclude<Role, "admin">;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// 로그인 상태에 따라 라우트를 보호한다 — 미로그인은 /login으로, 로그인 상태로
// /login에 있으면 홈으로 보낸다.
function useProtectedRoute(user: User | null, loading: boolean) {
  const segments = useSegments();
  const router = useRouter();

  // 데모 우회 플래그. EXPO_PUBLIC_DEMO_BYPASS=1 이면 미로그인이어도 /farm/* 에
  // 직접 URL로 들어온 경우는 통과시킨다. 프로덕션에선 이 값을 비운다.
  const demoBypass = process.env.EXPO_PUBLIC_DEMO_BYPASS === "1";

  useEffect(() => {
    if (loading) return;
    if (demoBypass && segments[0] === "farm") return;
    // Splash(루트)와 로그인·QR 스캔은 세션 없이 머물러도 되는 화면이다.
    // Splash가 세션을 보고 직접 다음 화면을 고르므로 여기서 가로채지 않는다.
    // useSegments의 유니온은 `.expo/types` 생성 시점의 라우트만 담으므로 문자열로 본다.
    const seg = segments as string[];
    const open = seg.length === 0 || seg[0] === "login" || seg[0] === "scan";
    if (!user && !open) {
      // 표식을 붙여 보낸다. 로그인 화면은 `?e=session`이 없으면 주소창으로 잘못
      // 들어온 것으로 보고 스플래시로 되돌리므로, 표식 없이 보내면 아무도
      // 로그인 화면에 머물지 못한다.
      router.replace("/login?e=session" as Href);
    } else if (user && seg[0] === "login") {
      // typedRoutes 유니온은 `.expo/types`가 만들어질 때만 새 경로를 안다.
      router.replace("/store-select" as Href);
    }
  }, [user, loading, segments, router, demoBypass]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 앱 시작 시 저장된 토큰으로 세션 복구
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const res = await apiFetch<{ user: User | null }>("/api/auth/me");
          if (res.user) setUser(res.user);
          else await clearToken();
        } catch {
          await clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  useProtectedRoute(user, loading);

  // 세 함수와 아래 value는 identity를 고정한다. 매 렌더 새로 만들면 이걸
  // effect 의존성으로 쓰는 화면이 렌더마다 effect를 다시 돌려 무한 루프가 된다.
  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const signup: AuthState["signup"] = useCallback(async (input) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/api/auth/signup",
      { method: "POST", body: JSON.stringify(input) }
    );
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
