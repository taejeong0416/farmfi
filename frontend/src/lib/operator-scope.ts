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
