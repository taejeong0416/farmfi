import { VerifyMethodScreen } from "@/components/screens/common/VerifyMethodScreen";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "본인확인 방법 선택 | FarmFi" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <VerifyMethodScreen next={safeNext(next)} />;
}
