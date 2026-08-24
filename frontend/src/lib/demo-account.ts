import { prisma } from "@/lib/db";

/**
 * 시연 계정 — 발표 한 번에 투자자·운영자·관리자 화면을 다 보여주기 위한 계정.
 *
 * `DEMO_ACCOUNTS`(쉼표 구분 이메일)에 적힌 계정만 해당한다. 목록이 비면 아무도
 * 해당하지 않으므로 일반 경로는 그대로다.
 *
 * **시연이 끝나면 이 환경변수를 비운다.** 여기 적힌 계정은 신분증 없이 본인확인을
 * 통과하고 역할 제한도 받지 않는다 — 실제 모집 전에 반드시 지운다(명세 17.1-5).
 */
export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.DEMO_ACCOUNTS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/** userId로 같은 판정을 한다. 목록이 비어 있으면 DB를 읽지 않는다. */
export async function isDemoUser(userId: string): Promise<boolean> {
  if (!process.env.DEMO_ACCOUNTS?.trim()) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return isDemoEmail(user?.email);
}
