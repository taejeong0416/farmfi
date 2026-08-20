import { PickupPassScreen } from "@/components/screens/buyer/PickupPassScreen";

export const metadata = { title: "픽업 확인증 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PickupPassScreen pickupId={id} />;
}
