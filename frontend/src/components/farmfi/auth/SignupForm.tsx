"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, type AssignableRole } from "@/lib/useAuth";
import { RoleSelect } from "./RoleSelect";

export function SignupForm() {
  const router = useRouter();
  const { signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("operator");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signup({ name, email, password, role });
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
        역할을 선택하고 이메일·비밀번호로 가입하세요.
      </p>

      <article className="card form-panel" style={{ marginTop: 24 }}>
        <div className="field-stack">
          <label>어떤 역할로 시작하시겠어요?</label>
          <RoleSelect value={role} onChange={setRole} />
        </div>

        <div className="field-stack" style={{ marginTop: 22 }}>
          <label htmlFor="signup-name">이름</label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
          />
        </div>

        <div className="field-stack" style={{ marginTop: 18 }}>
          <label htmlFor="signup-email">이메일</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="field-stack" style={{ marginTop: 18 }}>
          <label htmlFor="signup-password">비밀번호</label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상"
          />
        </div>

        {error && (
          <p style={{ color: "#c0392b", fontSize: 13, marginTop: 16 }}>{error}</p>
        )}

        <button
          className="btn"
          type="button"
          style={{ width: "100%", marginTop: 24, opacity: submitting ? 0.7 : 1 }}
          disabled={!name || !email || password.length < 8 || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "가입 처리 중..." : "가입 완료하기 →"}
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
