"use client";

import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { ProjectCreateForm } from "@/components/farmfi/project/new/ProjectCreateForm";

// operator/admin만 접근 가능. 세션은 useAuth()(GET /api/auth/me, httpOnly 쿠키 기반)로
// 확인하며, role 값은 항상 서버(JWT)가 내려준 값을 그대로 신뢰한다 — 클라이언트가
// 임의로 role을 조작할 방법은 없다. (POST /api/projects도 서버에서 다시 requireRole 검증.)
const ALLOWED_ROLES = new Set(["operator", "admin"]);

export default function NewProjectPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const role = user ? (user.role as string) : null;
  const isAllowed = isAuthenticated && role !== null && ALLOWED_ROLES.has(role);

  if (isLoading) {
    return (
      <main className="page">
        <div className="shell" style={{ padding: "80px 0" }}>
          <p className="muted">세션 확인 중...</p>
        </div>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className="page">
        <div className="shell" style={{ padding: "80px 0" }}>
          <article
            className="card"
            style={{ padding: 32, maxWidth: 480, margin: "0 auto", textAlign: "center" }}
          >
            <h2>접근 권한이 없어요</h2>
            <p className="muted" style={{ marginTop: 10 }}>
              공모 개설은 운영자 또는 관리자만 이용할 수 있어요.
              {isAuthenticated
                ? " 현재 계정에는 권한이 없어요."
                : " 먼저 로그인하면 이용할 수 있어요."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
              {!isAuthenticated && (
                <Link className="btn" href="/login">
                  로그인
                </Link>
              )}
              <Link className="ghost" href="/">
                홈으로
              </Link>
            </div>
          </article>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell" style={{ padding: "48px 0 80px" }}>
        <header style={{ marginBottom: 28 }}>
          <p className="eyebrow">운영자 · 관리자</p>
          <h1 style={{ fontSize: 32, maxWidth: "none" }}>프로젝트 공모 개설</h1>
          <p className="lead" style={{ marginTop: 12, fontSize: 15, maxWidth: "none" }}>
            신규 스마트팜 프로젝트 정보를 입력하고, 자금 집행을 검증할 마일스톤 4단계를
            정의하세요.
          </p>
        </header>
        <ProjectCreateForm />
      </div>
    </main>
  );
}
