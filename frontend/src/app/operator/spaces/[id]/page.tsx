import { SpaceDetailScreen } from "@/components/screens/operator/SpaceDetailScreen";

export const metadata = { title: "공간 상세 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SpaceDetailScreen id={id} />;
}
