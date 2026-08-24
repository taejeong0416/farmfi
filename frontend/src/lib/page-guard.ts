import { notFound, redirect } from "next/navigation";
import { getServerSession, type Role } from "@/lib/auth";
import { isDemoUser } from "@/lib/demo-account";

/**
 * 화면 단위 역할 관문.
 *
 * API는 `requireRole`이 막고 있었지만 **페이지에는 관문이 없었다.** 그래서 투자자
 * 세션으로 `/admin`을 열면 관리자 콘솔이 메뉴까지 그대로 그려졌다 — 데이터는 API가
 * 403으로 막아 대부분 비어 있었어도, 명세 2장이 정한 "현재 역할의 메뉴만 표시한다"는
 * 지켜지지 않았다.
 *
 * `requireRole`과 같은 규칙을 쓴다. admin은 전 구역을 보고, 시연 계정(`DEMO_ACCOUNTS`)은
 * 역할 제한을 받지 않는다 — 발표 한 번에 투자자·운영자·관리자 화면을 이어서 보여줘야 한다.
 * 미들웨어가 아니라 레이아웃에 두는 이유가 이것이다. 시연 계정 판정은 DB를 읽어야 하는데
 * 미들웨어는 edge 런타임이라 prisma를 못 쓴다.
 *
 * 권한이 없으면 404나 빈 화면 대신 자기 역할의 홈으로 보낸다. 잘못 눌러 들어온
 * 사용자에게 필요한 건 오류 문구가 아니라 돌아갈 곳이다.
 */
const ROLE_HOME: Record<Role, string> = {
  investor: "/investor",
  operator: "/operator",
  landlord: "/landlord",
  admin: "/admin",
};

export async function requirePageRole(role: Role, section: string) {
  const session = await getServerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(section)}`);
  }
  if (session.role === role || session.role === "admin") return session;
  if (await isDemoUser(session.userId)) return session;
  redirect(ROLE_HOME[session.role] ?? "/");
}

/**
 * 역할에 더해 배정 매장까지 본다. 매장 단위 화면(`/monitoring/[id]`,
 * `/optimization/[id]`)이 쓴다.
 *
 * 없는 매장과 남의 매장을 같은 404로 돌려준다. 여기서 403을 주면 "그 매장은 있는데
 * 네 것이 아니다"가 되어 매장 목록을 URL로 훑을 수 있다. API와 달리 화면에서는
 * 존재 여부를 숨기는 편이 낫다.
 */
export async function requireProjectPage(section: string, projectId: string) {
  const session = await requirePageRole("operator", section);
  if (session.role === "admin") return session;
  if (await isDemoUser(session.userId)) return session;

  const { canAccessProject } = await import("@/lib/operator-scope");
  if (!(await canAccessProject(session, projectId))) notFound();
  return session;
}
