import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getActivityScreenData,
  parseActivitySearchParams,
} from "@/features/activity/data/activity";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates/format";

type ActivityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const context = await requireWorkspaceContext();
  const params = await searchParams;
  const viewQuery = parseActivitySearchParams(params);
  const { changes, pagination } = await getActivityScreenData(
    context.organizationId,
    viewQuery,
  );

  return (
    <div>
      <PageHeader
        description="Review record changes, audit details, and links back to the affected modules."
        title="Activity Log"
      />
      <main className="grid gap-4 px-4 py-4 sm:px-6 lg:px-6">
        <form className="grid gap-3 rounded-md border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-[12px] font-medium text-muted">
            Entity
            <input
              className="h-9 rounded-md border border-border bg-background px-3 text-[13px] text-foreground"
              defaultValue={viewQuery.entityType}
              name="entityType"
              placeholder="unit, ledger_entry, task"
            />
          </label>
          <label className="grid gap-1 text-[12px] font-medium text-muted">
            Action
            <input
              className="h-9 rounded-md border border-border bg-background px-3 text-[13px] text-foreground"
              defaultValue={viewQuery.action}
              name="action"
              placeholder="created, updated, archived"
            />
          </label>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 self-end rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm hover:bg-surface-muted"
            type="submit"
          >
            <Search size={15} />
            Filter
          </button>
        </form>

        <section className="overflow-hidden rounded-md border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              {pagination.totalCount} audit records
            </p>
            <PaginationLinks pagination={pagination} viewQuery={viewQuery} />
          </div>
          {changes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              No activity records match these filters.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {changes.map((change) => (
                <article
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_180px_120px]"
                  key={change.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={change.tone}>{change.actionLabel}</Badge>
                      <span className="text-xs font-medium text-muted">
                        {change.entityLabel}
                      </span>
                    </div>
                    <Link
                      className="mt-2 inline-flex max-w-full items-center gap-1 text-sm font-semibold text-foreground hover:text-accent-strong"
                      href={change.href}
                      prefetch={false}
                    >
                      <span className="truncate">{change.recordLabel}</span>
                      <ArrowUpRight className="shrink-0" size={13} />
                    </Link>
                    {change.details.length > 0 ? (
                      <dl className="mt-2 grid gap-1 text-[12px] text-muted sm:grid-cols-2">
                        {change.details.slice(0, 4).map((detail) => (
                          <div className="min-w-0" key={detail.field}>
                            <dt className="font-medium text-foreground-subtle">
                              {detail.field}
                            </dt>
                            <dd className="truncate">
                              {detail.before} {"->"} {detail.after}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted">{formatDate(change.createdAt)}</p>
                  <p className="font-mono text-[11px] text-muted">{change.action}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function PaginationLinks({
  pagination,
  viewQuery,
}: {
  pagination: Awaited<ReturnType<typeof getActivityScreenData>>["pagination"];
  viewQuery: ReturnType<typeof parseActivitySearchParams>;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="text-muted">
        {pagination.from}-{pagination.to}
      </span>
      <PageLink
        disabled={!pagination.hasPrevious}
        href={getActivityHref(viewQuery, viewQuery.page - 1)}
        label="Previous"
      >
        <ArrowLeft size={14} />
      </PageLink>
      <PageLink
        disabled={!pagination.hasNext}
        href={getActivityHref(viewQuery, viewQuery.page + 1)}
        label="Next"
      >
        <ArrowRight size={14} />
      </PageLink>
    </div>
  );
}

function PageLink({
  children,
  disabled,
  href,
  label,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
  label: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted opacity-40"
        title={label}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-muted hover:text-foreground"
      href={href}
      prefetch={false}
      title={label}
    >
      {children}
    </Link>
  );
}

function getActivityHref(
  viewQuery: ReturnType<typeof parseActivitySearchParams>,
  page: number,
) {
  const params = new URLSearchParams();

  if (viewQuery.entityType) {
    params.set("entityType", viewQuery.entityType);
  }

  if (viewQuery.action) {
    params.set("action", viewQuery.action);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/activity?${query}` : "/activity";
}
