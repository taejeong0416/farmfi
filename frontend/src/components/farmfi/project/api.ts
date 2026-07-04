import type { ProjectDetail, ProjectListItem } from "./types";

export const projectsQueryKey = () => ["projects"] as const;
export const projectQueryKey = (id: string) => ["projects", id] as const;

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchProjects(): Promise<ProjectListItem[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new Error(body?.error ?? "프로젝트 목록을 불러오지 못했습니다.");
  }
  const data = (await res.json()) as { projects: ProjectListItem[] };
  return data.projects;
}

export async function fetchProject(id: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new Error(body?.error ?? "프로젝트 정보를 불러오지 못했습니다.");
  }
  return (await res.json()) as ProjectDetail;
}

// userId는 보내지 않는다 — 서버가 세션(JWT)에서만 읽는다.
export type SubscribeInput = {
  projectId: string;
  tokenAmount: number;
};

export type SubscribeResult = {
  success: true;
  transaction: {
    txHash: string | null;
    amount: number;
    tokenAmount: number;
  };
};

export async function subscribeToProject(
  input: SubscribeInput,
): Promise<SubscribeResult> {
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(body?.error ?? "청약에 실패했습니다.");
  }
  return body as SubscribeResult;
}
