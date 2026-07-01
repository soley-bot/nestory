import { AppShell } from "@/components/layout/app-shell";
import { getMaintenanceReminderNotifications } from "@/features/maintenance/data/maintenance";
import type { MaintenanceReminderNotification } from "@/features/maintenance/maintenance.types";
import { requireWorkspaceContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireWorkspaceContext();
  let maintenanceReminders: MaintenanceReminderNotification[] = [];

  try {
    maintenanceReminders = await getMaintenanceReminderNotifications(
      context.organizationId,
      {
        branchId: context.branchId,
        personId: context.personId,
        role: context.role,
      },
    );
  } catch {
    maintenanceReminders = [];
  }

  return (
    <AppShell
      maintenanceReminders={maintenanceReminders}
      organizationName={context.organizationName}
      role={context.role}
      userEmail={context.userEmail}
    >
      {children}
    </AppShell>
  );
}
