import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { SentryIdentity } from "@/components/observability/sentry-identity";
import { ThemeRuntime } from "@/components/theme-runtime";
import { requireWorkspaceContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireWorkspaceContext();
  // SidebarProvider writes sidebar_state on every toggle; read it back so the
  // rail renders in the state the operator left it, with no flash on load.
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;

  return (
    <ThemeRuntime
      organizationId={context.organizationId}
      theme={context.theme}
    >
      <SentryIdentity
        organizationId={context.organizationId}
        role={context.role}
        userId={context.userId}
      />
      <AppShell
        defaultSidebarOpen={sidebarState !== "false"}
        organizationId={context.organizationId}
        organizationName={context.organizationName}
        permissionKeys={[...context.permissionKeys]}
        role={context.role}
        roleKind={context.roleKind}
        roleName={context.roleName}
        theme={context.theme}
        userEmail={context.userEmail}
      >
        {children}
      </AppShell>
    </ThemeRuntime>
  );
}
