import { AppShell } from "@/components/layout/app-shell";
import { ThemeRuntime } from "@/components/theme-runtime";
import { requireWorkspaceContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireWorkspaceContext();

  return (
    <ThemeRuntime
      organizationId={context.organizationId}
      theme={context.theme}
    >
      <AppShell
        organizationName={context.organizationName}
        role={context.role}
        userEmail={context.userEmail}
      >
        {children}
      </AppShell>
    </ThemeRuntime>
  );
}
