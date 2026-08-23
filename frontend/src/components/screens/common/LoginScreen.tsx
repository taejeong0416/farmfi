"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Checkbox, Field, TextInput } from "@/components/ui";
import { useAuth } from "@/lib/useAuth";

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params?.get("next") ?? "/start";
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-modal px-6 py-14">
      <div className="rounded-10 border border-line bg-white">
        <div className="border-b border-line-soft px-6 py-5">
          <p className="text-15 font-bold text-brand">FarmFi</p>
        </div>
        <form className="px-6 py-7" onSubmit={submit}>
          <h1 className="text-20 font-bold text-ink">로그인</h1>
          <p className="mt-3 text-12 text-muted">
            투자, 정기구독 또는 공간 운영을 시작하려면 로그인해주세요.
          </p>

          <div className="mt-8 space-y-5">
            <Field label="이메일">
              <TextInput
                type="email"
                autoComplete="email"
                placeholder="invest@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="비밀번호">
              <TextInput
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Checkbox
              label="로그인 상태 유지"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
            />
            <span className="text-12 text-muted">비밀번호 찾기</span>
          </div>

          {error ? (
            <p className="mt-5 text-12 text-danger">{error}</p>
          ) : null}

          <div className="mt-7">
            <Button type="submit" full disabled={busy}>
              {busy ? "확인 중" : "로그인"}
            </Button>
          </div>

          <hr className="my-6 border-0 border-t border-line-soft" />

          <p className="text-center text-12 text-muted">
            아직 계정이 없으신가요?{" "}
            <Link href="/signup" className="font-medium text-brand">
              회원가입
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
