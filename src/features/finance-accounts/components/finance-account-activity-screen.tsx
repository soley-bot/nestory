import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WorkspacePage } from "@/components/layout/workspace-page";
import type { FinanceAccountActivity } from "@/features/finance-accounts/data/finance-account-activity";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";

export function FinanceAccountActivityScreen({ activity }: { activity: FinanceAccountActivity }) {
  const showRunningBalance = activity.runningBalance !== null;
  return (
    <WorkspacePage
      breadcrumbItems={[
        { href: "/finance", label: "Finance" },
        { href: "/finance/accounts", label: "Chart of Accounts" },
      ]}
      localNav={<FinanceWorkspaceNavigation activeRoute="/finance/accounts" />}
      title={activity.account.displayName}
      actions={<Badge variant={activity.account.archivedAt ? "secondary" : "outline"}>{activity.account.archivedAt ? "Inactive" : "Active"}</Badge>}
      toolbar={(
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="grid gap-1 text-xs text-muted-foreground">From
            <input className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" name="from" type="date" defaultValue={activity.filters.periodStart} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">To
            <input className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" name="to" type="date" defaultValue={activity.filters.periodEnd} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Property
            <select className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" name="propertyId" defaultValue={activity.filters.propertyId ?? "all"}>
              <option value="all">All properties</option>
              {activity.properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}
            </select>
          </label>
          <button className="h-8 rounded-md border bg-background px-3 text-sm font-medium" type="submit">Apply</button>
        </form>
      )}
    >
      <div className="workspace-gutter-x space-y-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border bg-card px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Basis</p>
            <p className="text-sm font-medium">{activity.basisLabel}</p>
          </div>
          <p className="font-mono text-lg tabular-nums">USD {activity.total}</p>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2" scope="col">Date</th>
                <th className="px-3 py-2" scope="col">Property</th>
                <th className="px-3 py-2" scope="col">Contact</th>
                <th className="px-3 py-2" scope="col">Source</th>
                <th className="px-3 py-2 text-right" scope="col">Increase</th>
                <th className="px-3 py-2 text-right" scope="col">Decrease</th>
                {showRunningBalance ? <th className="px-3 py-2 text-right" scope="col">Running balance</th> : null}
              </tr>
            </thead>
            <tbody>
              {activity.rows.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.propertyLabel}</td>
                  <td className="px-3 py-2">{row.contact ?? "—"}</td>
                  <td className="px-3 py-2"><Link className="font-medium underline-offset-4 hover:underline" href={row.sourceHref}>{row.description}</Link></td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{row.increase ? `USD ${row.increase}` : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{row.decrease ? `USD ${row.decrease}` : "—"}</td>
                  {showRunningBalance ? <td className="px-3 py-2 text-right font-mono tabular-nums">{row.runningBalance ? `USD ${row.runningBalance}` : "—"}</td> : null}
                </tr>
              ))}
              {activity.rows.length === 0 ? <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={showRunningBalance ? 7 : 6}>No activity in this period.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </WorkspacePage>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC", year: "numeric" })
    .format(new Date(`${value}T00:00:00.000Z`));
}
