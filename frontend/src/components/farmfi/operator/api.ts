export type OperatorApplicationStatus =
  | "applied"
  | "docs"
  | "education"
  | "matched"
  | "operating";

export type OperatorApplication = {
  id: string;
  userId: string;
  region: string;
  cropExperience: string;
  availableHours: string;
  status: OperatorApplicationStatus;
  createdAt: string;
};

export type SubmitApplicationInput = {
  region: string;
  cropExperience: string;
  availableHours: string;
};

export type SubmitApplicationResult = {
  application: OperatorApplication;
  alreadyApplied: boolean;
};

export const operatorApplicationsQueryKey = () => ["operator-applications", "me"] as const;

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessageOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

/**
 * The current session user's own application history (most recent first).
 * Returns an empty list when signed out — callers should gate on useAuth()
 * to distinguish "not logged in" from "logged in with no applications".
 */
export async function fetchMyOperatorApplications(): Promise<OperatorApplication[]> {
  const res = await fetch("/api/operator-applications", { credentials: "include" });
  if (res.status === 401) return [];
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new Error(errorMessageOf(body, "지원 현황을 불러오지 못했습니다."));
  }
  const data = (await res.json()) as { applications: OperatorApplication[] };
  return data.applications;
}

export async function submitOperatorApplication(
  input: SubmitApplicationInput
): Promise<SubmitApplicationResult> {
  const res = await fetch("/api/operator-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(errorMessageOf(body, "지원서 제출에 실패했습니다."));
  }
  return body as SubmitApplicationResult;
}
