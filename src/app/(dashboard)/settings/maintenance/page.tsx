import { SettingsShell } from "@/components/layout/settings-shell";
import { getPilotManualRestartStatus, requirePilotResetContext } from "@/features/reset-maintenance/context";
import { MaintenanceForm } from "@/features/reset-maintenance/maintenance-form";

export default async function PilotMaintenancePage() {
  const context = await requirePilotResetContext();
  const manualRestart = await getPilotManualRestartStatus();
  return <SettingsShell activeHref="/settings/maintenance" role={context.role}>
    <MaintenanceForm manualRestart={manualRestart} />
  </SettingsShell>;
}
