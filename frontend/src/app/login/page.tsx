import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { LoginForm } from "@/components/farmfi/auth/LoginForm";

// 이미 로그인 시 /mypage로 redirect.
export default async function LoginPage() {
  const session = await getServerSession();
  if (session) {
    redirect("/mypage");
  }

  return (
    <main className="page">
      <section className="section">
        <LoginForm />
      </section>
    </main>
  );
}
