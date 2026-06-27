import { PageHeader } from "@/components/layout/page-header";
import { CurrencySettingsForm } from "@/features/settings/components/currency-settings-form";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import { requireAdminContext } from "@/lib/auth/context";

export default async function SettingsPage() {
  const context = await requireAdminContext();
  const currencySettings = await getOrganizationCurrencySettings(
    context.organizationId,
  );

  return (
    <div>
      <PageHeader
        description="Phase 1 keeps access simple while preserving organization-wide defaults."
        title="Settings"
      />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <CurrencySettingsForm settings={currencySettings} />
      </div>
    </div>
  );
}
