import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { reportCatalog } from "@/features/reports/report-catalog";

const groups = [
  { title: "Transactions", kinds: ["transactions", "management-fees"] },
  { title: "Rent", kinds: ["rent-roll", "rent-collections"] },
  { title: "Owners", kinds: ["monthly-owner-activity", "unit-profit-loss"] },
];

export function ReportsDirectory({ canReadFinance = false }: { canReadFinance?: boolean }) {
  return <div className="workspace-gutter-x max-w-6xl space-y-4 py-3">
    <p className="text-sm text-muted-foreground">Choose a report to filter, review source records, and export.</p>
    {groups.map((group) => <section aria-label={`${group.title} reports`} key={group.title}>
      <h2 className="mb-2 text-sm font-semibold">{group.title}</h2>
      <div className="divide-y divide-border border-y border-border">
        {reportCatalog.filter((report) => group.kinds.includes(report.kind)).map((report) =>
          <DirectoryLink key={report.kind} href={`/reports/${report.kind}`} title={report.title} description={report.description} />)}
        {group.title === "Owners" && canReadFinance ? <DirectoryLink href="/balances?view=statements" title="Official owner statements" description="Saved monthly statements for each owner. Download the retained PDF or Excel." /> : null}
      </div>
    </section>)}
  </div>;
}

function DirectoryLink({ href, title, description }: { href: string; title: string; description: string }) {
  return <Link href={href} className="group grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 px-2 py-2 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[15rem_minmax(0,1fr)_auto]">
    <span className="text-sm font-medium text-foreground group-hover:text-primary">{title}</span>
    <span className="col-start-1 row-start-2 mt-1 max-w-2xl text-sm text-muted-foreground sm:col-start-2 sm:row-start-1 sm:mt-0">{description}</span>
    <ChevronRight aria-hidden="true" className="col-start-2 row-span-2 row-start-1 text-muted-foreground sm:col-start-3 sm:row-span-1" size={16} />
  </Link>;
}
