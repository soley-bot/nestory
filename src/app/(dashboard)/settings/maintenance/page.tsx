import { SettingsShell } from "@/components/layout/settings-shell";
import { requirePilotResetContext } from "@/features/reset-maintenance/context";
import { MaintenanceForm } from "@/features/reset-maintenance/maintenance-form";

export default async function PilotMaintenancePage() {
  const context = await requirePilotResetContext();
  return <SettingsShell activeHref="/settings/maintenance" role={context.role}>
    <MaintenanceForm />
  </SettingsShell>;
}
