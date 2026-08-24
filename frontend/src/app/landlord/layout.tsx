import { requirePageRole } from "@/lib/page-guard";

export default async function LandlordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePageRole("landlord", "/landlord");
  return <>{children}</>;
}
