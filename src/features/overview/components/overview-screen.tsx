import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { OverviewHeader } from "@/features/overview/components/overview-header";
import { OverviewLensWorkspace } from "@/features/overview/components/overview-lens-workspace";
import { PortfolioWorkspace } from "@/features/overview/components/portfolio-workspace";
import type { OverviewScreenData, OverviewViewQuery } from "@/features/overview/overview.types";

export function OverviewScreen({ data, query }: { data: OverviewScreenData; query?: OverviewViewQuery }) {
  if (!data.workspaceSetup.hasAnyOperatingData) return <EmptyWorkspaceOnboarding data={data} />;
  const resolvedQuery = query ?? defaultQuery();
  return (
    <main className="flex h-full min-h-0 bg-background">
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <OverviewHeader query={resolvedQuery} />
        <div className="flex min-h-0 flex-1 flex-col">
          {resolvedQuery.lens === "all" ? (
            <PortfolioWorkspace data={data} query={resolvedQuery} />
          ) : (
            <OverviewLensWorkspace data={data} query={resolvedQuery} />
          )}
        </div>
      </div>
    </main>
  );
}

function EmptyWorkspaceOnboarding({ data }: { data: OverviewScreenData }) {
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background px-4 py-5 sm:px-6 sm:py-7">
      <section data-slot="empty-workspace-onboarding">
        <header className="border-b border-border pb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Start with your operating records.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Create the first property, then import units, people, and leases.</p>
        </header>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid border-b border-border md:grid-cols-2 md:divide-x md:divide-border xl:border-b-0">
            <section className="border-b border-border py-5 md:border-b-0 md:pr-6">
              <h2 className="text-sm font-semibold">Setup plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">Build the property shell before adding its linked operating records.</p>
              <Link className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90" href="/properties?action=create">Add first property <ArrowRight size={14} /></Link>
            </section>
            <section className="py-5 md:pl-6">
              <h2 className="text-sm font-semibold">Import center</h2>
              <p className="mt-1 text-sm text-muted-foreground">Properties, units, people, and leases.</p>
              <p className="mt-1 text-sm text-muted-foreground">500 valid rows per commit</p>
              <Link className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium" href="/import"><Upload size={14} /> Open imports</Link>
            </section>
          </div>

          <aside className="border-t border-border py-5 xl:border-l xl:border-t-0 xl:pl-6">
            <h2 className="text-sm font-semibold">Workspace counts</h2>
            <dl className="mt-2 divide-y divide-border text-sm">
              <Count label="Properties" value={data.workspaceSetup.propertyCount} />
              <Count label="Units" value={data.workspaceSetup.unitCount} />
              <Count label="People" value={data.workspaceSetup.peopleCount} />
              <Count label="Leases" value={data.workspaceSetup.activeLeaseCount} />
            </dl>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Count({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums text-foreground">{value}</dd></div>; }
function defaultQuery(): OverviewViewQuery { return { financeView: "collections", lens: "all", month: new Date().toISOString().slice(0, 7), propertyId: "all", review: "all" }; }
