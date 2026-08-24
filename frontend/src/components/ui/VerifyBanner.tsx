"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isBareRoute } from "./AppHeader";
import { useAuth } from "@/lib/useAuth";

/**
 * 본인확인을 안 끝낸 계정에 돌아갈 길을 열어둔다.
 *
 * 가입 도중 창을 닫으면 다음 로그인은 곧장 홈으로 떨어진다. 그때 마이페이지를
 * 찾아 들어가지 않는 한 확인 화면으로 가는 길이 화면 어디에도 없었다.
 *
 * 확인 절차를 밟는 중(`/verify`)이거나 로그인·가입 화면일 때는 숨긴다 —
 * 이미 그 자리에 있는 사람에게 같은 말을 두 번 하지 않는다.
 */
export function VerifyBanner() {
  const pathname = usePathname() ?? "/";
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated) return null;
  if (!user || user.identityVerified) return null;
  if (isBareRoute(pathname) || pathname.startsWith("/admin")) return null;

  return (
    <div className="border-b border-line-soft bg-surface">
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-3 px-8 py-3">
        <p className="text-12 text-body">
          본인확인을 마쳐야 투자할 수 있어요.
        </p>
        <Link
          href="/verify"
          className="flex h-8 items-center rounded-6 bg-brand px-4 text-12 font-medium text-white"
        >
          이어서 확인하기
        </Link>
      </div>
    </div>
  );
}
