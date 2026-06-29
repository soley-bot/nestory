import { PageHeader } from "@/components/layout/page-header";
import { requireAdminContext } from "@/lib/auth/context";

export default async function SettingsPage() {
  const context = await requireAdminContext();

  return (
    <div>
      <PageHeader
        description="Workspace identity, access posture, and MVP operating defaults."
        title="Settings"
      />
      <div className="px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SettingsFact label="Workspace" value={context.organizationName} />
          <SettingsFact
            label="Signed-in admin"
            value={context.userEmail ?? "Authenticated admin"}
          />
          <SettingsFact label="Currency" value="USD" />
          <SettingsFact label="Access model" value="Single admin" />
        </section>
      </div>
    </div>
  );
}

function SettingsFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-2.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}
