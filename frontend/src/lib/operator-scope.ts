import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

/**
 * 배정 매장 게이트.
 *
 * 인수 기준: "배정되지 않은 매장의 데이터는 어떤 화면에서도 보이지 않는다."
 * 역할 검사(`requireRole("operator")`)만으로는 아무 운영자나 남의 매장을 열 수 있다.
 * 소유 검사는 여기 한 곳에서 한다 — 라우트마다 다시 짜면 한 군데는 빠진다.
 *
 * admin은 통과시킨다. 관리자 콘솔이 전 지점을 봐야 하기 때문이다.
 */

/** 이 세션이 접근할 수 있는 프로젝트 ID 목록. admin이면 null(=전체). */
export async function allowedProjectIds(
  session: SessionPayload,
): Promise<string[] | null> {
  if (session.role === "admin") return null;
  const rows = await prisma.project.findMany({
    where: { operatorId: session.userId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** 특정 프로젝트에 접근할 수 있는지. 없으면 던지는 대신 false를 준다. */
export async function canAccessProject(
  session: SessionPayload,
  projectId: string,
): Promise<boolean> {
  if (session.role === "admin") return true;
  const found = await prisma.project.findFirst({
    where: { id: projectId, operatorId: session.userId },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * 접근 불가면 403 Response를 돌려준다(라우트에서 그대로 return).
 * 접근 가능하면 null.
 *
 * 404가 아니라 403을 준다 — 존재 여부를 숨기려고 404를 쓰면 운영자가
 * "매장 ID가 틀렸나" 하고 헤매게 된다. 이 앱에서 매장 ID는 비밀이 아니다.
 */
export async function guardProject(
  session: SessionPayload,
  projectId: string,
): Promise<Response | null> {
  if (await canAccessProject(session, projectId)) return null;
  return new Response(
    JSON.stringify({ error: "배정되지 않은 매장입니다." }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

/**
 * 운영 데이터 라우트의 공통 관문.
 *
 * 역할 검사와 매장 소유 검사를 한 번에 한다. 라우트마다 두 줄씩 다시 쓰면
 * 한 군데는 빠지고, 실제로 빠져 있었다 — `sales/trend`·`monitoring/[projectId]`·
 * `tasks/today`·`notifications`가 인증조차 없이 프로덕션에 열려 있었다.
 * projectId만 알면 남의 매장 센서 데이터가 그대로 나왔다.
 *
 * 성공하면 `{ session, scope }`. `scope`는 조회에 끼울 프로젝트 id 목록이고
 * admin이면 null(전체)이다. 실패하면 Response를 돌려주므로 그대로 return한다.
 *
 * @example
 *   const gate = await operatorGate(request);
 *   if (gate instanceof Response) return gate;
 *   const { scope } = gate;
 */
export async function operatorGate(
  request: Request,
  opts?: { projectIdFrom?: "query" | "none"; paramName?: string },
): Promise<{ session: SessionPayload; scope: string[] | null; projectId: string | null } | Response> {
  const { requireRole } = await import("@/lib/auth");

  let session: SessionPayload;
  try {
    session = await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (opts?.projectIdFrom === "none") {
    return { session, scope: await allowedProjectIds(session), projectId: null };
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get(opts?.paramName ?? "projectId");

  if (projectId) {
    const denied = await guardProject(session, projectId);
    if (denied) return denied;
    return { session, scope: [projectId], projectId };
  }

  // projectId를 안 주면 "내 매장 전부"로 좁힌다. 열어 두면 전 지점이 나온다.
  return { session, scope: await allowedProjectIds(session), projectId: null };
}

/**
 * 이미 읽어 온 매장 행으로 소유를 판정한다. 조회가 아니라 판정이라 prisma를 타지 않는다 —
 * 라우트가 단계·증빙을 읽으면서 매장을 함께 가져오는 경우가 있고, 그때 같은 행을 두 번
 * 읽을 이유가 없다.
 *
 * **운영자에게 미배정 매장(`operatorId == null`)은 남의 매장과 같다.** 인수 기준이
 * "운영자는 배정되지 않은 공간의 증빙을 제출할 수 없다"이므로, 주인이 없는 매장은
 * 아무나 쓸 수 있는 매장이 아니라 아직 아무도 쓸 수 없는 매장이다.
 */
export function ownsProject(
  session: { userId: string; role: string },
  project: { operatorId: string | null },
): boolean {
  if (session.role === "admin") return true;
  return project.operatorId !== null && project.operatorId === session.userId;
}

/** `scope`를 prisma where 절에 끼우는 형태로. admin(null)이면 빈 객체 — 제한 없음. */
export function scopeFilter(scope: string[] | null, field = "projectId"): Record<string, unknown> {
  if (scope === null) return {};
  return { [field]: { in: scope } };
}
