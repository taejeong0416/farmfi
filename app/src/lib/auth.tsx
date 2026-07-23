import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSegments } from "expo-router";
import { apiFetch, setToken, clearToken, getToken } from "./api";

export type Role = "investor" | "operator" | "landlord" | "admin";
export type User = {
  id: string;
  name: string;
  email: string | null;
  role: Role;
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

  // 데모 우회 플래그. EXPO_PUBLIC_DEMO_BYPASS=1 이면 미로그인도 /farm 미리보기 허용
  // (진입은 모니터링으로). 프로덕션에선 이 값을 비워 원래 /login 가드로 동작한다.
  const demoBypass = process.env.EXPO_PUBLIC_DEMO_BYPASS === "1";

  useEffect(() => {
    if (loading) return;
    if (demoBypass && segments[0] === "farm") return;
    const inAuthScreen = segments[0] === "login";
    if (!user && !inAuthScreen) {
      router.replace(demoBypass ? "/farm/monitoring" : "/login");
    } else if (user && inAuthScreen) {
      router.replace("/");
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

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    await setToken(res.token);
    setUser(res.user);
  };

  const signup: AuthState["signup"] = async (input) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/api/auth/signup",
      { method: "POST", body: JSON.stringify(input) }
    );
    await setToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
