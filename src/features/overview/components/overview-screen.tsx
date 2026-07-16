import Link from "next/link";
import { ArrowRight, Building2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OverviewAttentionQueue } from "@/features/overview/components/overview-attention-queue";
import { OverviewHeader } from "@/features/overview/components/overview-header";
import { OverviewLensWorkspace } from "@/features/overview/components/overview-lens-workspace";
import { PortfolioWorkspace } from "@/features/overview/components/portfolio-workspace";
import { PropertyFinanceWorkspace } from "@/features/overview/components/property-finance-workspace";
import type { OverviewScreenData, OverviewViewQuery } from "@/features/overview/overview.types";

export function OverviewScreen({ data, query }: { data: OverviewScreenData; query?: OverviewViewQuery }) {
  if (!data.workspaceSetup.hasAnyOperatingData) return <EmptyWorkspaceOnboarding data={data} />;
  const resolvedQuery = query ?? defaultQuery();
  return (
    <main className="min-h-screen bg-background px-4 py-3 sm:px-5">
      <div className="space-y-3">
        <OverviewHeader attentionTotal={data.attentionTotal} query={resolvedQuery} />
        {!isBaseSetupComplete(data.workspaceSetup) ? <SetupProgressPanel data={data} /> : null}
        <OverviewAttentionQueue items={data.attentionItems} />
        {resolvedQuery.lens === "all" ? (
          <PortfolioWorkspace data={data} query={resolvedQuery} />
        ) : resolvedQuery.lens === "finance" ? (
          <PropertyFinanceWorkspace data={data} query={resolvedQuery} />
        ) : (
          <OverviewLensWorkspace data={data} query={resolvedQuery} />
        )}
      </div>
    </main>
  );
}

function EmptyWorkspaceOnboarding({ data }: { data: OverviewScreenData }) {
  return (
    <main className="min-h-screen bg-background px-4 py-3 sm:px-5">
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4 sm:p-5">
            <Badge tone="warning">Setup needed</Badge>
            <h1 className="mt-2 text-xl font-semibold text-foreground">Start with your operating records.</h1>
            <p className="mt-1 text-sm text-foreground-muted">Create the first property, then import units, people, and leases.</p>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <section className="rounded-md border border-border p-3">
              <h2 className="text-sm font-semibold">Setup plan</h2>
              <p className="mt-1 text-sm text-foreground-muted">Build the property shell before adding its linked operating records.</p>
              <Link className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white" href="/properties?action=create">Add first property <ArrowRight size={14} /></Link>
            </section>
            <section className="rounded-md border border-border p-3">
              <h2 className="text-sm font-semibold">Import center</h2>
              <p className="mt-1 text-sm text-foreground-muted">Properties, units, people, and leases.</p>
              <p className="mt-1 text-sm text-foreground-muted">500 valid rows per commit</p>
              <Link className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium" href="/import"><Upload size={14} /> Open imports</Link>
            </section>
          </div>
        </div>
        <aside className="rounded-lg border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Workspace counts</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-foreground-muted">
            <Count label="Properties" value={data.workspaceSetup.propertyCount} />
            <Count label="Units" value={data.workspaceSetup.unitCount} />
            <Count label="People" value={data.workspaceSetup.peopleCount} />
            <Count label="Leases" value={data.workspaceSetup.activeLeaseCount} />
          </div>
        </aside>
      </section>
    </main>
  );
}

function SetupProgressPanel({ data }: { data: OverviewScreenData }) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/20 p-3">
      <Building2 className="text-warning" size={16} />
      <div className="mr-auto">
        <p className="text-sm font-semibold">Finish the records that make Overview reliable.</p>
        <p className="text-xs text-foreground-muted">Properties {data.workspaceSetup.propertyCount} · Units {data.workspaceSetup.unitCount} · People {data.workspaceSetup.peopleCount} · Leases {data.workspaceSetup.activeLeaseCount}</p>
      </div>
      <Link className="text-xs font-medium underline-offset-2 hover:underline" href="/import">Continue setup</Link>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) { return <div className="rounded-md border border-border p-2"><p>{label}</p><p className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</p></div>; }
function isBaseSetupComplete(setup: OverviewScreenData["workspaceSetup"]) { return setup.propertyCount > 0 && setup.unitCount > 0 && setup.peopleCount > 0 && setup.activeLeaseCount > 0; }
function defaultQuery(): OverviewViewQuery { return { financeView: "collections", lens: "all", month: new Date().toISOString().slice(0, 7), propertyId: "all", review: "all" }; }
