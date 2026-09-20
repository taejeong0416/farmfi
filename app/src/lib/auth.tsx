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
import {
  apiFetch,
  setToken,
  clearToken,
  getToken,
  getLinkedCredential,
  setLinkedCredential,
  clearLinkedCredential,
} from "./api";

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
  /** 보증서 확인(M-02)을 마쳤는지. null은 아직 확인 중. */
  credentialLinked: boolean | null;
  /** 보증서 확인을 마친 번호를 기기에 남긴다. 다음 실행부터 M-02를 건너뛴다. */
  markCredentialLinked: (credentialNo: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// 로그인 상태와 보증서 연결 여부로 라우트를 보호한다.
//
// 관문이 둘이다 — 세션(M-01)과 보증서 확인(M-02). 명세 1장이 "앱 진입 조건이
// 보증서 확인"이라고 정했고 흐름도도 세션이 있어도 보증서가 미연결·정지·만료면
// M-02로 보낸다. 로그인만으로 매장 화면이 열리면 그 조건이 사라진다.
function useProtectedRoute(
  user: User | null,
  loading: boolean,
  credentialLinked: boolean | null
) {
  const segments = useSegments();
  const router = useRouter();

  // 데모 우회 플래그. EXPO_PUBLIC_DEMO_BYPASS=1 이면 미로그인이어도 /farm/* 에
  // 직접 URL로 들어온 경우는 통과시킨다. 프로덕션에선 이 값을 비운다.
  const demoBypass = process.env.EXPO_PUBLIC_DEMO_BYPASS === "1";

  useEffect(() => {
    if (loading) return;
    if (demoBypass && segments[0] === "farm") return;
    // Splash(루트)와 로그인은 세션 없이 머물러도 되는 화면이다. Splash가 세션을
    // 보고 직접 다음 화면을 고르므로 여기서 가로채지 않는다.
    // useSegments의 유니온은 `.expo/types` 생성 시점의 라우트만 담으므로 문자열로 본다.
    const seg = segments as string[];
    const open = seg.length === 0 || seg[0] === "login";

    if (!user) {
      // 표식을 붙여 보낸다. 로그인 화면은 `?e=session`이 없으면 주소창으로 잘못
      // 들어온 것으로 보고 스플래시로 되돌리므로, 표식 없이 보내면 아무도
      // 로그인 화면에 머물지 못한다.
      // typedRoutes 유니온은 `.expo/types`가 만들어질 때만 새 경로를 안다.
      if (!open) router.replace("/login?e=session" as Href);
      return;
    }

    // 조회가 끝나기 전에는 움직이지 않는다. 여기서 성급히 보내면 이미 확인을
    // 마친 사람도 앱을 열 때마다 스캔 화면을 한 번씩 본다.
    if (credentialLinked === null) return;

    if (!credentialLinked) {
      if (seg[0] !== "scan") router.replace("/scan" as Href);
      return;
    }

    // 확인을 마친 뒤 스캔 화면에 머무는 것은 본인이 결과를 보고 있는 동안이다.
    // 그 화면의 버튼이 다음으로 보내므로 여기서 가로채지 않는다.
    if (seg[0] === "login") router.replace("/store-select" as Href);
  }, [user, loading, credentialLinked, segments, router, demoBypass]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [credentialLinked, setCredentialLinked] = useState<boolean | null>(null);

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

  // 세션이 생기면 보증서가 지금도 쓸 수 있는지 서버에 묻는다. 기기에 남은 번호와
  // 서버 판정이 모두 맞아야 통과다 — 정지·만료는 서버만 알고, 기기에 이력이
  // 없으면 애초에 확인을 한 적이 없다.
  useEffect(() => {
    if (!user) {
      setCredentialLinked(null);
      return;
    }
    // 운영자가 아닌 계정(관리자 등)에는 보증서 관문을 걸지 않는다.
    if (user.role !== "operator") {
      setCredentialLinked(true);
      return;
    }
    let alive = true;
    (async () => {
      const linked = await getLinkedCredential();
      if (!alive) return;
      if (!linked) {
        setCredentialLinked(false);
        return;
      }
      try {
        const res = await apiFetch<{
          credential: { credentialNo: string } | null;
          check: { valid: boolean };
        }>("/api/operator/credential");
        if (!alive) return;
        setCredentialLinked(
          res.check.valid === true && res.credential?.credentialNo === linked
        );
      } catch {
        // 통신이 끊긴 것과 보증서가 무효인 것은 다르다. 마지막으로 확인된
        // 상태를 유지한다 — 지하 매장에서 네트워크가 끊겼다고 운영 화면을
        // 잠그면 현장에서 할 수 있는 일이 없다.
        if (alive) setCredentialLinked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  useProtectedRoute(user, loading, credentialLinked);

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
    await clearLinkedCredential();
    setUser(null);
    setCredentialLinked(null);
  }, []);

  const markCredentialLinked = useCallback(async (credentialNo: string) => {
    await setLinkedCredential(credentialNo);
    setCredentialLinked(true);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      logout,
      credentialLinked,
      markCredentialLinked,
    }),
    [user, loading, login, signup, logout, credentialLinked, markCredentialLinked]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
