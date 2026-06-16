import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileText,
  ListTree,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-background">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link className="text-sm font-semibold tracking-tight" href="/">
            Nestory
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              href="/login"
            >
              Sign in
            </Link>
            <Link
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#184b48]"
              href="/signup"
            >
              Create account
            </Link>
          </nav>
        </header>

        <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-14 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,0.86fr)_minmax(460px,1.14fr)] lg:items-center lg:pb-20 lg:pt-10">
          <div className="max-w-2xl lg:pb-10">
            <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <ClipboardCheck size={14} />
              Admin access and the record room
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Property history, in one place.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted">
              Nestory starts with the essentials: one admin, a timeline-first record,
              property and unit context, documents, and money fields that respect USD
              and KHR.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-[#184b48]"
                href="/signup"
              >
                Create admin account
                <ArrowRight size={16} />
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
                href="/login"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div
            aria-label="Nestory product preview"
            className="overflow-hidden rounded-md border border-border bg-surface shadow-sm"
          >
            <div className="grid grid-cols-[180px_1fr] border-b border-border max-md:grid-cols-1">
              <div className="border-r border-border bg-surface-muted/45 p-4 max-md:hidden">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white">
                    <ListTree size={17} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Nestory</p>
                    <p className="text-xs text-muted">Record room</p>
                  </div>
                </div>
                {["Timeline", "Properties", "Units", "Documents"].map((item) => (
                  <div
                    className="mb-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted"
                    key={item}
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="min-w-0 p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                      Property timeline
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">Central Residence</h2>
                  </div>
                  <p className="rounded-md border border-border px-3 py-1 text-xs text-muted">
                    USD / KHR
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {[
                    ["2026-06-12", "Renovation", "Unit 12B bathroom refit completed"],
                    ["2026-06-08", "Inspection", "Quarterly unit inspection recorded"],
                    ["2026-05-25", "Document", "Owner agreement added"],
                    ["2026-05-19", "Lease", "New lease started after handover"],
                  ].map(([date, type, detail]) => (
                    <div
                      className="grid grid-cols-[96px_110px_minmax(0,1fr)] gap-4 py-3 text-sm max-sm:grid-cols-1 max-sm:gap-1"
                      key={detail}
                    >
                      <span className="font-mono text-xs text-muted">{date}</span>
                      <span className="text-xs font-medium text-accent">{type}</span>
                      <span className="min-w-0 text-muted">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-10 md:grid-cols-3">
        {[
          {
            icon: ListTree,
            title: "Timeline first",
            body: "Every lease note, inspection, repair, and document starts as property history.",
          },
          {
            icon: Building2,
            title: "Company scoped",
            body: "Each workspace keeps its own property records without adding confusing roles yet.",
          },
          {
            icon: FileText,
            title: "Audit ready",
            body: "Old records can be edited later, but important changes need an activity trail.",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <article className="border-t border-border pt-4" key={item.title}>
              <Icon className="mb-3 text-accent" size={18} />
              <h2 className="text-sm font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
