"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  configurationRegistry,
  type ConfigurationHistoryPolicy,
  type ConfigurationModule,
} from "@/features/configuration/registry";
import type { WorkspaceRole } from "@/lib/auth/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

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

const historyPolicyLabels: Record<ConfigurationHistoryPolicy, string> = {
  display_only: "Display only",
  prospective_only: "Prospective only",
  recalculate_unposted: "Recalculate unposted",
};

export function ConfigurationRegistryCatalog() {
  const [openModule, setOpenModule] = useState<ConfigurationModule | null>(null);
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-foreground">Configuration</h2>
        <Badge tone="neutral">Read-only</Badge>
      </div>

      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([module, definitions]) => {
          const open = openModule === module;

          return (
            <Card className="gap-0 py-0" key={module} size="sm">
              <CardHeader className={open ? "border-b px-2 py-2" : "px-2 py-2"}>
                <Button
                  aria-label={`${moduleLabels[module]}, ${definitions.length} settings`}
                  aria-expanded={open}
                  className="h-8 w-full justify-start px-2"
                  onClick={() => setOpenModule(open ? null : module)}
                  variant="ghost"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={open ? "rotate-180 transition-transform" : "transition-transform"}
                  />
                  <span className="font-medium">{moduleLabels[module]}</span>
                  <Badge className="ml-auto" tone="neutral">
                    {definitions.length}
                  </Badge>
                </Button>
              </CardHeader>
              {open ? (
                <CardContent className="divide-y divide-border px-4">
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(90px,0.6fr)_minmax(90px,0.6fr)_minmax(120px,0.8fr)_minmax(90px,0.6fr)] gap-3 pb-2 text-xs text-muted-foreground md:grid">
                    <span>Setting</span>
                    <span>Default</span>
                    <span>Owner</span>
                    <span>Existing records</span>
                    <span>After launch</span>
                  </div>
                  {definitions.map((definition) => (
                    <article
                      className="grid gap-2 py-3 first:pt-1 last:pb-1 md:grid-cols-[minmax(0,1.4fr)_minmax(90px,0.6fr)_minmax(90px,0.6fr)_minmax(120px,0.8fr)_minmax(90px,0.6fr)] md:items-center md:gap-3"
                      key={definition.key}
                    >
                      <h4 className="text-sm font-medium text-foreground">
                        {definition.label}
                      </h4>
                      <RegistryFact label="Default" value={formatValue(definition.defaultValue)} />
                      <RegistryFact label="Owner" value={formatOwner(definition.owner)} />
                      <RegistryFact
                        label="Existing records"
                        value={historyPolicyLabels[definition.historyPolicy]}
                      />
                      <RegistryFact
                        label="After launch"
                        value={definition.safeAfterGoLive ? "Allowed" : "Restricted"}
                      />
                    </article>
                  ))}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function RegistryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 md:block">
      <span className="text-xs text-muted-foreground md:hidden">{label}</span>
      <span className="truncate text-sm font-medium text-foreground">{value}</span>
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
