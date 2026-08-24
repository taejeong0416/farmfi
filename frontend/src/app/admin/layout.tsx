import { requirePageRole } from "@/lib/page-guard";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePageRole("admin", "/admin");
  return <>{children}</>;
}
