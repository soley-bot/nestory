import { AppShell } from "@/components/layout/app-shell";
import { requireWorkspaceContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireWorkspaceContext();

  return (
    <AppShell
      organizationName={context.organizationName}
      role={context.role}
      userEmail={context.userEmail}
    >
      {children}
    </AppShell>
  );
}
