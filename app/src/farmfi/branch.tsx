import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, describeApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// 지점(=프로젝트) 선택은 화면마다 따로 두지 않고 여기 한 곳에서만 관리한다.
// 모든 운영 화면이 같은 projectId를 보게 하려는 것 — 목록의 유일한 출처는
// GET /api/projects이며 하드코딩된 지점명은 없다.
export type FarmProject = {
  id: string;
  name: string;
  status: string;
  location: string | null;
};

type ProjectsState = {
  projects: FarmProject[];
  projectId: string | null;
  project: FarmProject | null;
  setProjectId: (id: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** 원본 오류. 화면이 401/403(로그인 필요)과 그 외를 구분해 안내하려면 문구가 아니라
   *  이 값이 필요하다. `describeApiError`를 거치면 상태 코드가 사라진다. */
  rawError: unknown;
};

const ProjectsContext = createContext<ProjectsState | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<FarmProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawError, setRawError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 목록은 로그인한 사람에게 매인다. 누가 보고 있는지 바뀌면 다시 읽어야 한다.
  //
  // 앱을 처음 켰을 때는 토큰이 아직 없다 — 스플래시가 그 자리에서 세션을 받아온다.
  // 마운트 한 번으로 끝내면 그 시점의 401이 화면에 박혀, 로그인이 끝난 뒤에도
  // 운영 화면 16개가 전부 "지점 목록을 불러오지 못했습니다"만 띄운다.
  // 계정을 바꿔 로그인했을 때 앞사람의 지점이 남아 있는 것도 같은 이유다.
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    let alive = true;

    // 세션을 확인하는 중이거나 로그인 전이면 묻지 않는다. 물어봐야 401이고,
    // 그 401은 사용자가 할 수 있는 게 없는 오류다.
    if (authLoading || !userId) {
      setProjects([]);
      setProjectId(null);
      setError(null);
      setRawError(null);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);
    setRawError(null);

    apiFetch<{ projects: FarmProject[] }>("/api/projects")
      .then((res) => {
        if (!alive) return;
        const list = res.projects ?? [];
        setProjects(list);
        // 선택이 없거나 목록에서 사라진 지점을 가리키면 첫 지점으로 되돌린다.
        setProjectId((current) =>
          current && list.some((p) => p.id === current)
            ? current
            : (list[0]?.id ?? null)
        );
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(describeApiError(e, "지점 목록을 불러오지 못했습니다."));
        setRawError(e);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [nonce, userId, authLoading]);

  const value = useMemo<ProjectsState>(
    () => ({
      projects,
      projectId,
      project: projects.find((p) => p.id === projectId) ?? null,
      setProjectId,
      loading,
      error,
      reload,
      rawError,
    }),
    [projects, projectId, loading, error, rawError, reload]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useFarmProjects(): ProjectsState {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useFarmProjects must be used within BranchProvider");
  return ctx;
}
