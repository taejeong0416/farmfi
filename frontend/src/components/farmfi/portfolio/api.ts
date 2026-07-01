import type { PortfolioResponse } from "./types";

export const portfolioQueryKey = () => ["portfolio"] as const;

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPortfolio(): Promise<PortfolioResponse> {
  const res = await fetch("/api/portfolio", { credentials: "include" });
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new Error(body?.error ?? "포트폴리오 정보를 불러오지 못했습니다.");
  }
  return (await res.json()) as PortfolioResponse;
}
