"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAuth, type AssignableRole } from "@/lib/useAuth";
import { RoleSelect } from "./RoleSelect";
import { WalletConnectPanel } from "./WalletConnectPanel";

export function SignupForm() {
  const router = useRouter();
  const { login, updateRole } = useAuth();
  const { isConnected } = useAccount();

  const [role, setRole] = useState<AssignableRole>("investor");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // 1) SIWE 서명 → 세션 생성(신규 지갑은 서버가 기본 investor로 upsert).
      await login();
      // 2) 이번 온보딩에서 고른 역할을 확정 저장(서버가 세션 소유자에게만 적용).
      await updateRole(role);
      router.push("/mypage");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="shell" style={{ maxWidth: 640 }}>
      <span className="eyebrow">회원가입</span>
      <h1 style={{ fontSize: 36 }}>FarmFi 시작하기</h1>
      <p className="lead" style={{ marginTop: 14 }}>
        역할을 선택하고 지갑을 연결하면 서명 한 번으로 가입이 끝나요.
      </p>

      <div className="stepline" style={{ marginTop: 28 }}>
        <span className="step is-done">1. 역할 선택</span>
        <span className={`step ${isConnected ? "is-done" : "is-active"}`}>2. 지갑 연결</span>
        <span className={`step ${isConnected ? "is-active" : ""}`}>3. 가입 완료</span>
      </div>

      <article className="card form-panel" style={{ marginTop: 24 }}>
        <div className="field-stack">
          <label>어떤 역할로 시작하시겠어요?</label>
          <RoleSelect value={role} onChange={setRole} />
        </div>

        <div className="field-stack" style={{ marginTop: 22 }}>
          <label>지갑 연결</label>
          <WalletConnectPanel />
        </div>

        {error && (
          <p style={{ color: "#c0392b", fontSize: 13, marginTop: 16 }}>{error}</p>
        )}

        <button
          className="btn"
          type="button"
          style={{ width: "100%", marginTop: 24, opacity: submitting ? 0.7 : 1 }}
          disabled={!isConnected || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "가입 처리 중..." : "서명하고 가입 완료하기 →"}
        </button>

        <p className="muted" style={{ marginTop: 14, textAlign: "center" }}>
          이미 계정이 있으신가요?{" "}
          <Link className="link" href="/login" style={{ marginTop: 0 }}>
            로그인 →
          </Link>
        </p>
      </article>
    </div>
  );
}
