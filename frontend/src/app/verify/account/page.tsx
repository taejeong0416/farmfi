import { VerifyAccountScreen } from "@/components/screens/common/VerifyAccountScreen";

export const metadata = { title: "본인 명의 계좌 확인 | FarmFi" };

// 계좌를 고치러 온 경로(I-08 회수 실패)는 원래 보던 화면으로 돌아가야 한다.
// 열린 리다이렉트가 되지 않게 앱 내부 경로만 받는다.
function safeNext(value: string | string[] | undefined): string | undefined {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

export default async function VerifyAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <VerifyAccountScreen next={safeNext(next)} />;
}
