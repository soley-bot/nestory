import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { LandingHeader } from "@/features/marketing/components/landing-header";
import { PublicInterestForm } from "@/features/marketing/components/public-interest-form";

export const metadata: Metadata = {
  description:
    "Request information or a guided demo of Nestory property operations software.",
  title: "Request information or a demo",
};

const requestNotes = [
  "A guided look at the operating record, not a generic product tour",
  "Portfolio scope and workflow fit reviewed before workspace provisioning",
  "Client workspaces stay managed and invite-only",
];

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const { intent } = await searchParams;
  const initialRequestType = intent === "information" ? "information" : "demo";

  return (
    <main className="landing-page min-h-svh bg-[var(--landing-bg)] text-[var(--landing-fg)] transition-colors">
      <LandingHeader />
      <section className="px-6 pb-16 pt-32 sm:px-10 sm:pb-24 sm:pt-36 lg:px-14">
        <div className="mx-auto max-w-[1180px]">
          <Link
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--landing-subtle)] transition-colors hover:text-[var(--landing-heading)]"
            href="/"
          >
            <ArrowLeft size={14} />
            Back to Nestory
          </Link>

          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(420px,0.72fr)] lg:items-start lg:gap-20">
            <div className="lg:sticky lg:top-32">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--landing-accent)]">
                Managed access
              </p>
              <h1 className="mt-5 max-w-2xl font-display text-4xl font-semibold leading-[1.06] text-[var(--landing-heading)] sm:text-5xl">
                Start with the operating brief.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[var(--landing-muted)]">
                Tell us about the portfolio and the work you need to keep under
                control. We will use that context for a focused follow-up.
              </p>

              <div className="mt-10 border-t border-[var(--landing-border)]">
                {requestNotes.map((note) => (
                  <div
                    className="grid grid-cols-[22px_minmax(0,1fr)] gap-3 border-b border-[var(--landing-border)] py-4 text-sm leading-6 text-[var(--landing-muted)]"
                    key={note}
                  >
                    <Check
                      aria-hidden="true"
                      className="mt-1 text-[var(--landing-accent)]"
                      size={15}
                    />
                    <p>{note}</p>
                  </div>
                ))}
              </div>

              <p className="mt-8 text-sm leading-6 text-[var(--landing-muted)]">
                Already invited?{" "}
                <Link
                  className="font-semibold text-[var(--landing-accent)] hover:opacity-75"
                  href="/login"
                >
                  Sign in to your workspace
                </Link>
                .
              </p>
            </div>

            <PublicInterestForm initialRequestType={initialRequestType} />
          </div>
        </div>
      </section>
    </main>
  );
}
