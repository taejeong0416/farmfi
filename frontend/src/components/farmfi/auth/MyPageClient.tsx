"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Panel, PortfolioPanel } from "@/components/FarmFi";
import { IdentityBadge } from "@/components/farmfi/auth/IdentityBadge";
import { useAuth, type AuthUserRole } from "@/lib/useAuth";

const ROLE_LABEL: Record<AuthUserRole, string> = {
  investor: "투자자",
  landlord: "건물주",
  operator: "운영자",
  admin: "관리자",
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        {label}
      </p>
      <p style={{ marginTop: 4, fontSize: 16, fontWeight: 900 }}>{value}</p>
    </div>
  );
}

export function MyPageClient() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  // 서버(app/mypage/page.tsx)가 1차로 세션을 확인하지만, 하이드레이션 사이에
  // 세션이 만료되는 경우를 대비한 2차 방어선.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (isLoading || !user) {
    return (
      <div className="shell">
        <p className="muted">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="shell" style={{ maxWidth: 720 }}>
      <span className="eyebrow">마이페이지</span>
      <h1 style={{ fontSize: 36 }}>{user.name}님</h1>

      <div style={{ marginTop: 28 }}>
        <Panel title="내 정보">
          <div style={{ display: "grid", gap: 16 }}>
            <InfoRow label="역할" value={ROLE_LABEL[user.role] ?? user.role} />
            {user.email && <InfoRow label="이메일" value={user.email} />}
          </div>
        </Panel>
      </div>

      {user.role === "investor" && (
        <>
          <div style={{ marginTop: 20 }}>
            <Panel title="본인인증">
              {/* 현재 세션 응답(/api/auth/me)에 identityVerified가 없어 투자자에게는
                  항상 진입점을 노출한다. 인증 완료 여부·시각은 /verify-identity에서 확인. */}
              <IdentityBadge identityVerified={false} verifiedAt={null} />
            </Panel>
          </div>
          <div style={{ marginTop: 20 }}>
            <PortfolioPanel />
          </div>
        </>
      )}

      <button className="ghost" type="button" style={{ marginTop: 28 }} onClick={handleLogout}>
        로그아웃
      </button>
    </div>
  );
}
