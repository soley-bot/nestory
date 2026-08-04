import {
  configurationRegistry,
  type ConfigurationHistoryPolicy,
  type ConfigurationModule,
} from "@/features/configuration/registry";
import type { WorkspaceRole } from "@/lib/auth/context";

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

const historyPolicyLabels: Record<ConfigurationHistoryPolicy, string> = {
  display_only: "Display only",
  prospective_only: "Prospective only",
  recalculate_unposted: "Recalculate unposted",
};

export function ConfigurationRegistryCatalog() {
  const grouped = configurationRegistry.reduce(
    (groups, definition) => {
      const current = groups.get(definition.module) ?? [];
      current.push(definition);
      groups.set(definition.module, current);
      return groups;
    },
    new Map<
      ConfigurationModule,
      (typeof configurationRegistry)[number][]
    >(),
  );

  return (
    <section className="min-w-0" data-testid="configuration-registry-catalog">
      <div className="max-w-3xl">
        <h2 className="text-sm font-semibold text-foreground">
          Configuration registry
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          The registry defines which business rules may vary by workspace, who
          owns them, and how changes affect existing records. Values are
          read-only in this first slice while persistence and approval rules
          are added.
        </p>
      </div>

      <div className="mt-4 border-y border-border py-3">
        <h3 className="text-sm font-semibold text-foreground">
          Registry guardrail
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-foreground-muted">
          A setting must be registered here before product code may depend on
          it. Customer-specific branching is not allowed.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
          <GuardrailFact
            label="Registered rules"
            value={String(configurationRegistry.length)}
          />
          <GuardrailFact
            label="Audited"
            value={String(
              configurationRegistry.filter((item) => item.auditRequired)
                .length,
            )}
          />
          <GuardrailFact
            label="Restricted after launch"
            value={String(
              configurationRegistry.filter((item) => !item.safeAfterGoLive)
                .length,
            )}
          />
          <GuardrailFact label="Current mode" value="Catalog only" />
        </dl>
      </div>

      <div className="mt-5 space-y-6">
        {Array.from(grouped.entries()).map(([module, definitions]) => (
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
                    <RegistryFact
                      label="Default"
                      value={formatValue(definition.defaultValue)}
                    />
                    <RegistryFact
                      label="Owner"
                      value={formatOwner(definition.owner)}
                    />
                    <RegistryFact
                      label="Change pattern"
                      value={frequencyLabels[definition.changeFrequency]}
                    />
                    <RegistryFact
                      label="Existing records"
                      value={historyPolicyLabels[definition.historyPolicy]}
                    />
                    <RegistryFact
                      label="After go-live"
                      value={
                        definition.safeAfterGoLive ? "Allowed" : "Restricted"
                      }
                    />
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function GuardrailFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
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

function formatOwner(owner: WorkspaceRole) {
  if (owner === "admin") return "Admin";
  if (owner === "manager") return "Manager";
  return "Member";
}
