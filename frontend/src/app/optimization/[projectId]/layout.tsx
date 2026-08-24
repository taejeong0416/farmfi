import { requireProjectPage } from "@/lib/page-guard";

/**
 * 이 화면은 서버 컴포넌트가 prisma를 직접 읽어 리포트를 그린다. API 관문을 지나지
 * 않으므로 여기서 막지 않으면 URL만 알면 남의 매장 생육 목표값·전력 요금·수율 모델이
 * 그대로 나온다.
 */
export default async function OptimizationLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  await requireProjectPage("/operator", projectId);
  return <>{children}</>;
}
