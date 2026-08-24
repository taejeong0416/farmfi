import { VerifyMobileIdScreen } from "@/components/screens/common/VerifyMobileIdScreen";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "모바일 신분증 확인 | FarmFi" };

export default async function VerifyMobileIdPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <VerifyMobileIdScreen next={safeNext(next)} />;
}
