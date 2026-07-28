import { ConsequencePanel } from "@/components/ui/consequence-panel";
import {
  configurationRegistry,
  type ConfigurationModule,
} from "@/features/configuration/registry";

const moduleLabels: Record<ConfigurationModule, string> = {
  workspace: "Workspace",
  finance: "Finance",
  leases: "Leases",
  maintenance: "Maintenance",
  notifications: "Notifications",
  branding: "Branding",
  access: "Access",
  integrations: "Integrations",
};

const frequencyLabels = {
  setup_once: "Setup once",
  occasional: "Occasional",
  frequent: "Frequent",
} as const;

export function ConfigurationRegistryCatalog() {
  const grouped = Object.entries(
    Object.groupBy(configurationRegistry, (definition) => definition.module),
  ) as [ConfigurationModule, (typeof configurationRegistry)[number][]][];

  return (
    <>
      <section
        className="min-w-0 rounded-md border border-border bg-surface px-4 py-4"
        data-testid="configuration-registry-catalog"
      >
        <div className="max-w-3xl">
          <h2 className="text-sm font-semibold text-foreground">
            Configuration registry
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            The registry defines which business rules may vary by workspace,
            who owns them, and how changes affect existing records. Values are
            read-only in this first slice while persistence and approval rules
            are added.
          </p>
        </div>

        <div className="mt-5 space-y-6">
          {grouped.map(([module, definitions]) => (
            <section key={module}>
              <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {moduleLabels[module]}
                </h3>
                <span className="text-xs text-foreground-muted">
                  {definitions.length} {definitions.length === 1 ? "rule" : "rules"}
                </span>
              </div>
              <div className="divide-y divide-border">
                {definitions.map((definition) => (
                  <article
                    className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_220px]"
                    key={definition.key}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h4 className="text-sm font-medium text-foreground">
                          {definition.label}
                        </h4>
                        <code className="break-all text-xs text-foreground-muted">
                          {definition.key}
                        </code>
                      </div>
                      <p className="mt-1 text-sm text-foreground-muted">
                        {definition.description}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:grid-cols-1">
                      <RegistryFact label="Default" value={formatValue(definition.defaultValue)} />
                      <RegistryFact label="Owner" value={formatOwner(definition.owner)} />
                      <RegistryFact
                        label="Change pattern"
                        value={frequencyLabels[definition.changeFrequency]}
                      />
                      <RegistryFact
                        label="After go-live"
                        value={definition.safeAfterGoLive ? "Allowed" : "Restricted"}
                      />
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <aside
        className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1"
        data-testid="configuration-registry-summary"
      >
        <ConsequencePanel
          rows={[
            { label: "Registered rules", value: configurationRegistry.length },
            {
              label: "Audited",
              value: configurationRegistry.filter((item) => item.auditRequired).length,
            },
            {
              label: "Restricted after launch",
              value: configurationRegistry.filter((item) => !item.safeAfterGoLive).length,
            },
            { label: "Current mode", value: "Catalog only" },
          ]}
          summary="A setting must be registered here before product code may depend on it. Customer-specific branching is not allowed."
          title="Registry guardrail"
        />
      </aside>
    </>
  );
}

function RegistryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 md:grid md:grid-cols-[100px_minmax(0,1fr)]">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="text-right font-medium text-foreground md:text-left">{value}</dd>
    </div>
  );
}

function formatValue(value: boolean | number | string) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  return String(value);
}

function formatOwner(owner: "admin" | "finance_admin" | "operations_admin") {
  if (owner === "finance_admin") return "Finance admin";
  if (owner === "operations_admin") return "Operations admin";
  return "Admin";
}
