import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { SignupForm } from "@/components/farmfi/auth/SignupForm";

// 이미 로그인된 사용자가 다시 온보딩을 밟지 않도록 서버에서 먼저 막는다.
export default async function SignupPage() {
  const session = await getServerSession();
  if (session) {
    redirect("/mypage");
  }

  return (
    <main className="page">
      <section className="section">
        <SignupForm />
      </section>
    </main>
  );
}
