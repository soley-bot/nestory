import { AppShell } from "@/components/layout/app-shell";
import { requireAdminContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAdminContext();

  return (
    <AppShell
      organizationName={context.organizationName}
      userEmail={context.userEmail}
    >
      {children}
    </AppShell>
  );
}
