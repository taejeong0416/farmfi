import { SignupScreen } from "@/components/screens/common/SignupScreen";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "회원가입 | FarmFi" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <SignupScreen next={safeNext(next)} />;
}
