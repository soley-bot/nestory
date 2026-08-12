import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function RecordNotFound({
  backHref,
  backLabel,
  recordLabel,
}: {
  backHref: string;
  backLabel: string;
  recordLabel: string;
}) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Missing record
        </p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">
          {recordLabel} not found
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          It may have been archived, removed, or outside your workspace.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={backHref}
          >
            <ArrowLeft aria-hidden="true" size={14} />
            {backLabel}
          </Link>
          <Link
            className="inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            href="/overview"
          >
            Overview
          </Link>
        </div>
      </section>
    </main>
  );
}
