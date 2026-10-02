import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LandingHeader } from "@/features/marketing/components/landing-header";
import { PublicInterestForm } from "@/features/marketing/components/public-interest-form";

export const metadata: Metadata = {
  description:
    "Ask about Nestory property management software or request a demo.",
  title: "Request information or a demo",
};

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const { intent } = await searchParams;
  const initialRequestType = intent === "information" ? "information" : "demo";

  return (
    <main className="landing-page min-h-svh bg-[var(--landing-bg)] text-[var(--landing-fg)] transition-colors">
      <LandingHeader tone="semantic" />
      <section className="px-6 pb-16 pt-32 sm:px-10 sm:pb-24 sm:pt-36 lg:px-14">
        <div className="mx-auto max-w-[1180px]">
          <Link
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--landing-subtle)] transition-colors hover:text-[var(--landing-heading)]"
            href="/"
          >
            <ArrowLeft size={14} />
            Back to Nestory
          </Link>

          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(420px,0.72fr)] lg:items-start lg:gap-20">
            <div className="lg:sticky lg:top-32">
              <h1 className="max-w-2xl font-display text-4xl font-semibold leading-[1.06] text-[var(--landing-heading)] sm:text-5xl">
                Talk to Nestory.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[var(--landing-muted)]">
                Tell us about your properties and what you need.
              </p>

              <p className="mt-6 text-sm leading-6 text-[var(--landing-muted)]">
                Already have an account?{" "}
                <Link
                  className="font-semibold text-foreground underline-offset-4 transition-colors hover:text-muted-foreground hover:underline"
                  href="/login"
                >
                  Sign in
                </Link>
                .
              </p>
            </div>

            <PublicInterestForm initialRequestType={initialRequestType} key={initialRequestType} />
          </div>
        </div>
      </section>
    </main>
  );
}
