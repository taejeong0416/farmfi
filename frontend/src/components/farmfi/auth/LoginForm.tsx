"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/useAuth";
import { WalletConnectPanel } from "./WalletConnectPanel";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const { isConnected } = useAccount();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login();
      router.push("/mypage");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="shell" style={{ maxWidth: 480 }}>
      <span className="eyebrow">로그인</span>
      <h1 style={{ fontSize: 36 }}>다시 만나서 반가워요</h1>
      <p className="lead" style={{ marginTop: 14 }}>
        지갑을 연결하고 서명하면 로그인이 완료돼요.
      </p>

      <article className="card form-panel" style={{ marginTop: 24 }}>
        <div className="field-stack">
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
          onClick={handleLogin}
        >
          {submitting ? "로그인 중..." : "서명하고 로그인하기 →"}
        </button>

        <p className="muted" style={{ marginTop: 14, textAlign: "center" }}>
          계정이 없으신가요?{" "}
          <Link className="link" href="/signup" style={{ marginTop: 0 }}>
            회원가입 →
          </Link>
        </p>
      </article>
    </div>
  );
}
