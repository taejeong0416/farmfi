export type MySpace = {
  id: string;
  ownerId: string | null;
  spaceType: string;
  address: string;
  area: string;
  electricity: string;
  water: string;
  lighting: string;
  preferredMode: string;
  photos: string[];
  suitabilityScore: number | null;
  estimatedRent: number | null;
  status: string;
  createdAt: string;
};

export const spacesQueryKey = () => ["spaces"] as const;

/**
 * GET /api/spaces is session-scoped: it returns only the signed-in user's own
 * spaces (admin sees all) and 401s without a session. Callers still filter by
 * ownerId client-side so an admin session never renders others' spaces as "mine".
 */
export async function fetchAllSpaces(): Promise<MySpace[]> {
  const res = await fetch("/api/spaces", { credentials: "include" });
  if (!res.ok) {
    throw new Error("공간 목록을 불러오지 못했습니다.");
  }
  const data = (await res.json()) as { spaces: MySpace[] };
  return data.spaces;
}
