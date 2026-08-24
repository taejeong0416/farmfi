import { VerifyAccountScreen } from "@/components/screens/common/VerifyAccountScreen";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "본인 명의 계좌 확인 | FarmFi" };

// 계좌를 고치러 온 경로(I-08 회수 실패)와 투자 신청에서 온 경로는
// 등록을 마친 뒤 원래 보던 화면으로 돌아가야 한다.
export default async function VerifyAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <VerifyAccountScreen next={safeNext(next)} />;
}
