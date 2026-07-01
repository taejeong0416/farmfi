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
 * GET /api/spaces returns every space platform-wide (no session filter — that
 * route is owned by another agent and is read-only here). Callers on the
 * landlord dashboard MUST filter the result down to the signed-in owner's
 * spaces themselves; never render the raw list as "my spaces".
 */
export async function fetchAllSpaces(): Promise<MySpace[]> {
  const res = await fetch("/api/spaces", { credentials: "include" });
  if (!res.ok) {
    throw new Error("공간 목록을 불러오지 못했습니다.");
  }
  const data = (await res.json()) as { spaces: MySpace[] };
  return data.spaces;
}
