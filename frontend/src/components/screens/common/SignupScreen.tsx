"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell, Button, Checkbox, Field, TextInput } from "@/components/ui";
import { withNext } from "@/lib/safe-next";
import { useAuth } from "@/lib/useAuth";

/** next: 가입·본인확인을 마친 뒤 돌아갈 앱 내부 경로. 보던 화면에서 왔을 때 넘어온다. */
export function SignupScreen({ next }: { next?: string }) {
  const router = useRouter();
  const { signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    if (!terms || !privacy) {
      setError("필수 약관에 동의해야 가입할 수 있습니다.");
      return;
    }
    setBusy(true);
    try {
      // 가입 시점에는 역할을 묻지 않는다. 이용 목적은 다음 화면(C-04)에서 고른다.
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
        role: "investor",
      });
      router.push(withNext("/verify", next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell header>
      <form onSubmit={submit}>
        <h1 className="text-20 font-bold text-ink">회원가입</h1>
        <p className="mt-3 text-12 text-muted">
          가입 후 투자자 또는 구매자로 이용할 서비스를 선택할 수 있어요.
        </p>

        <div className="mt-8 space-y-5">
          <Field label="이름" required>
            <TextInput
              placeholder="실명을 입력하세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="이메일" required>
            <TextInput
              type="email"
              autoComplete="email"
              placeholder="이메일 주소를 입력하세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="비밀번호" required>
            <TextInput
              type="password"
              autoComplete="new-password"
              placeholder="8자 이상"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          <Field label="비밀번호 확인" required>
            <TextInput
              type="password"
              autoComplete="new-password"
              placeholder="한 번 더 입력하세요"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="mt-7 border-t border-line-soft">
          <Agreement
            label="서비스 이용약관 동의"
            required
            checked={terms}
            onChange={setTerms}
          />
          <Agreement
            label="개인정보 수집 · 이용 동의"
            required
            checked={privacy}
            onChange={setPrivacy}
          />
          <Agreement
            label="마케팅 정보 수신 동의"
            checked={marketing}
            onChange={setMarketing}
          />
        </div>

        {error ? <p className="mt-5 text-12 text-danger">{error}</p> : null}

        <div className="mt-7">
          <Button type="submit" full disabled={busy}>
            {busy ? "가입 중" : "가입하고 신원 확인하기"}
          </Button>
        </div>

        <p className="mt-6 text-center text-12 text-muted">
          이미 계정이 있으신가요?{" "}
          <Link href={withNext("/login", next)} className="font-medium text-brand">
            로그인
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

function Agreement({
  label,
  required,
  checked,
  onChange,
}: {
  label: string;
  required?: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-surface py-3">
      <Checkbox
        label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`text-12 ${required ? "font-medium text-brand" : "text-muted"}`}
      >
        {required ? "필수" : "선택"}
      </span>
    </div>
  );
}
