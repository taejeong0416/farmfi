"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
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
        이메일과 비밀번호로 로그인해요.
      </p>

      <article className="card form-panel" style={{ marginTop: 24 }}>
        <div className="field-stack">
          <label htmlFor="login-email">이메일</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="field-stack" style={{ marginTop: 18 }}>
          <label htmlFor="login-password">비밀번호</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
            placeholder="비밀번호"
          />
        </div>

        {error && (
          <p style={{ color: "#c0392b", fontSize: 13, marginTop: 16 }}>{error}</p>
        )}

        <button
          className="btn"
          type="button"
          style={{ width: "100%", marginTop: 24, opacity: submitting ? 0.7 : 1 }}
          disabled={!email || !password || submitting}
          onClick={handleLogin}
        >
          {submitting ? "로그인 중..." : "로그인하기 →"}
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
