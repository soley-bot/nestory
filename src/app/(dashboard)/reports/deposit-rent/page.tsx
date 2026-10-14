import { redirect } from "next/navigation";
import { z } from "zod";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SelectControl } from "@/components/ui/select-control";
import { requirePermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { loadScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { loadLocalDepositReport, type LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";

export default async function DepositRentReportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePermission("finance.view");
  if (!context.permissionKeys.has("leases.view")) redirect("/no-access?reason=capability");
  const params = await searchParams;
  const parsed = z.object({ propertyId: z.uuid().optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse({
    propertyId: params.propertyId || undefined, month: params.month ?? getBusinessMonthValue(new Date(), context.operationalTimezone),
  });
  const client = await createSupabaseServerClient();
  const finance = await loadScopedFinanceContext(client, context.organizationId);
  let report: Awaited<ReturnType<typeof loadLocalDepositReport>> | undefined, message = "", download = "";
  if (!parsed.success) message = "Choose a valid property and month.";
  else if (parsed.data.propertyId) {
    if (!finance.properties.some(row => row.id === parsed.data.propertyId)) message = "This property is unavailable for your current access.";
    else {
      const from = `${parsed.data.month}-01`;
      const [year, month] = parsed.data.month.split("-").map(Number);
      const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      try {
        report = await loadLocalDepositReport(client as unknown as LocalDepositClient, {
          actorId: context.userId, organizationId: context.organizationId, propertyIds: [parsed.data.propertyId], periodStart: from, periodEnd: to,
        });
        download = new URLSearchParams({ propertyId: parsed.data.propertyId, from, to, expectedFingerprint: report.sourceFingerprint }).toString();
      } catch { message = "The deposit sources could not be verified for this scope. Review the deposit history and try again."; }
    }
  }
  const reportRows = report?.rows.filter(row => !row.id.startsWith("metadata:")) ?? [];
  const property = parsed.success ? finance.properties.find(row => row.id === parsed.data.propertyId) : undefined;
  return <WorkspacePage title="Deposit rent settlements" breadcrumbItems={context.capabilities.canReadFinanceReports
    ? [{ href: "/reports", label: "Reports" }] : [{ href: "/leases", label: "Leases" }]}>
    <div className="workspace-gutter-x space-y-5 py-4">
      <p className="max-w-3xl text-sm text-muted-foreground">Rent settled from existing deposits is recognized on the application date. Receipts remain deposit custody until applied; an application does not create a new bank payment.</p>
      <form className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-64 gap-1.5 text-sm font-medium">Property<SelectControl name="propertyId" ariaLabel="Settlement property" required placeholder="Choose a property" defaultValue={parsed.success ? parsed.data.propertyId : undefined} options={finance.properties.map(row => ({ value: row.id, label: `${row.code} · ${row.name}` }))}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Month<Input type="month" name="month" aria-label="Settlement month" required defaultValue={parsed.success ? parsed.data.month : undefined}/></label>
        <Button type="submit">View settlements</Button>
      </form>
      {message ? <ErrorState title="Unable to show deposit settlements" message={message} /> : null}
      {report ? <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{property?.code} · {property?.name} · {report.periodLabel}</p>
          <div className="flex gap-3 text-sm"><a className="underline" href={`/api/reports/deposit-rent?${download}&format=pdf`}>Download PDF</a><a className="underline" href={`/api/reports/deposit-rent?${download}&format=xlsx`}>Download Excel</a></div>
        </div>
        <dl className="border-y border-border py-3">{report.summary.map(row => <div key={row.label}><dt className="text-sm text-muted-foreground">{row.label}</dt><dd className="text-lg font-semibold">{row.value}</dd></div>)}</dl>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="border-b p-2">Date</th><th className="border-b p-2">Movement</th><th className="border-b p-2">USD amount</th><th className="border-b p-2">Source details</th></tr></thead><tbody>{reportRows.map(row => <tr key={row.id}>
          <td className="border-b p-2 align-top">{row.cells.date}</td>
          <td className="border-b p-2 align-top">{row.title}</td>
          <td className="border-b p-2 align-top">{row.cells.amount}</td>
          <td className="border-b p-2 align-top"><details><summary className="cursor-pointer">View source details</summary><p className="max-w-xl whitespace-pre-wrap break-words py-2">{row.cells.source}<br />{row.cells.detail}</p></details></td>
        </tr>)}</tbody></table></div>
        {!reportRows.length ? <EmptyState kind="empty" title="No deposit rent settlements in this period" /> : null}
        <p className="text-xs text-muted-foreground">Deposit settlements only. View owner balances and official statements for the complete custody history.</p>
      </> : !message ? <p className="text-sm text-muted-foreground">Choose a property and month to review its deposit settlements.</p> : null}
    </div>
  </WorkspacePage>;
}
