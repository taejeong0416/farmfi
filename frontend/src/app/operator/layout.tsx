import { requirePageRole } from "@/lib/page-guard";

export default async function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePageRole("operator", "/operator");
  return <>{children}</>;
}
