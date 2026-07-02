import Link from "next/link";
import {
  ArrowUpRight,
  DatabaseBackup,
  Download,
  FileArchive,
  FileText,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import type { ReportKind } from "@/features/reports/reports.types";
import { requireAdminContext } from "@/lib/auth/context";

type ExportLink = {
  description: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
};

const exportReports: Array<{
  description: string;
  kind: ReportKind;
  label: string;
}> = [
  {
    description: "Units, active leases, rent, and linked evidence.",
    kind: "rent-roll",
    label: "Rent roll",
  },
  {
    description: "Income, expenses, NOI, and maintenance by unit.",
    kind: "unit-performance",
    label: "Unit performance",
  },
  {
    description: "Owner-facing net movement by property.",
    kind: "owner-statement",
    label: "Owner statement",
  },
  {
    description: "Records missing owners, leases, rent, or evidence.",
    kind: "missing-data",
    label: "Missing data",
  },
];

export default async function BackupDataPage() {
  const context = await requireAdminContext();
  const month = new Date().toISOString().slice(0, 7);
  const exportLinks = exportReports.flatMap((report) => [
    {
      description: report.description,
      href: buildReportHref("/api/reports/export", report.kind, month),
      icon: Download,
      label: `${report.label} CSV`,
    },
    {
      description: report.description,
      href: buildReportHref("/api/reports/pdf", report.kind, month),
      icon: FileText,
      label: `${report.label} PDF`,
    },
  ]);

  return (
    <div>
      <PageHeader
        description="Production data safety, exports, and cleanup paths."
        title="Backup and Data"
      />
      <main className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileArchive size={15} />
              Export pack
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Generated from live report data for {context.organizationName}.
            </p>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-2">
            {exportLinks.map((link) => (
              <ExportAction key={link.href} link={link} />
            ))}
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <section className="rounded-md border border-border bg-surface p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <DatabaseBackup size={15} />
              Recovery checklist
            </h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-5 text-muted">
              <li>Export the pack before bulk imports or cleanup work.</li>
              <li>Keep documents private in Supabase Storage.</li>
              <li>Use archive states instead of destructive deletes.</li>
              <li>Review missing data after each import batch.</li>
            </ul>
          </section>

          <section className="rounded-md border border-border bg-surface p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={15} />
              Data operations
            </h2>
            <div className="mt-3 grid gap-2">
              <ActionLink
                description="Upload old records into review before committing."
                href="/import"
                icon={Upload}
                label="Import cleanup"
              />
              <ActionLink
                description="Audit evidence files and archived documents."
                href="/documents?archiveState=all"
                icon={FileArchive}
                label="Documents"
              />
              <ActionLink
                description="Review admin access before production data work."
                href="/users-roles"
                icon={ShieldCheck}
                label="Users and roles"
              />
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function ExportAction({ link }: { link: ExportLink }) {
  return (
    <a
      className="group grid gap-1 rounded-md border border-border bg-surface-muted px-3 py-3 text-[13px] transition-colors hover:bg-surface"
      href={link.href}
    >
      <span className="flex items-center gap-2 font-medium text-foreground">
        <link.icon size={15} />
        {link.label}
        <ArrowUpRight className="ml-auto text-muted group-hover:text-foreground" size={13} />
      </span>
      <span className="leading-5 text-muted">{link.description}</span>
    </a>
  );
}

function ActionLink({
  description,
  href,
  icon: Icon,
  label,
}: {
  description: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}) {
  return (
    <Link
      className="group grid gap-1 rounded-md border border-border bg-surface-muted px-3 py-3 text-[13px] transition-colors hover:bg-surface"
      href={href}
    >
      <span className="flex items-center gap-2 font-medium text-foreground">
        <Icon size={15} />
        {label}
        <ArrowUpRight className="ml-auto text-muted group-hover:text-foreground" size={13} />
      </span>
      <span className="leading-5 text-muted">{description}</span>
    </Link>
  );
}

function buildReportHref(basePath: string, report: ReportKind, month: string) {
  const params = new URLSearchParams({
    month,
    property: "all",
    report,
    status: "all",
  });

  return `${basePath}?${params.toString()}`;
}
