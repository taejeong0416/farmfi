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
};

const ProjectsContext = createContext<ProjectsState | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<FarmProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

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
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [nonce]);

  const value = useMemo<ProjectsState>(
    () => ({
      projects,
      projectId,
      project: projects.find((p) => p.id === projectId) ?? null,
      setProjectId,
      loading,
      error,
      reload,
    }),
    [projects, projectId, loading, error, reload]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useFarmProjects(): ProjectsState {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useFarmProjects must be used within BranchProvider");
  return ctx;
}
