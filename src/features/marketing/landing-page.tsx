import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ControlPreview } from "./components/control-preview";
import { LandingHeader } from "./components/landing-header";
import { LandingScrollMotion } from "./components/landing-scroll-motion";

const heroStats = [
  { label: "Portfolio", text: "properties, units, owners, tenants" },
  { label: "Rent", text: "collections, balances, deposits" },
  { label: "Operations", text: "leases, maintenance, records" },
] as const;

const coordinatedWork = [
  {
    description: "Requests stay attached to the property, unit, assignee, and evidence.",
    label: "Maintenance",
  },
  {
    description: "Approvals, bills, rent, and owner balances share one traceable ledger.",
    label: "Finance",
  },
  {
    description: "Current records become credible reports without rebuilding the story.",
    label: "Reporting",
  },
] as const;

const heroToneStyle = {
  "--landing-heading": "#ffffff",
  "--landing-muted": "rgb(255 255 255 / 72%)",
} as CSSProperties;

export function LandingPage() {
  return (
    <main className="landing-page bg-[var(--landing-bg)] text-[var(--landing-fg)] transition-colors">
      <LandingMotion />
      <LandingScrollMotion />
      <LandingHeader tone="hero" />

      <section
        className="landing-hero relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#050607] pt-24"
        style={heroToneStyle}
      >
        <Image
          alt="Modern apartment building at dusk"
          className="landing-hero-image absolute inset-0 -z-30 object-cover"
          fill
          priority
          sizes="100vw"
          src="/marketing/property-operations-building-dusk.png"
          style={{ objectPosition: "center 46%", transform: "scale(1.06)" }}
        />
        <div aria-hidden="true" className="landing-hero-overlay absolute inset-0 -z-20" />
        <div aria-hidden="true" className="landing-hero-bottom absolute inset-x-0 bottom-0 -z-10 h-52" />

        <div className="mx-auto flex w-full max-w-[1360px] flex-1 items-center px-6 py-16 sm:px-10 lg:px-14">
          <div className="max-w-3xl landing-hero-copy">
            <h1 className="font-display text-4xl font-semibold leading-tight text-[var(--landing-heading)] drop-shadow-[0_2px_18px_rgb(0_0_0_/_30%)] sm:text-5xl lg:text-6xl">
              What if your whole portfolio stayed under control?
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--landing-muted)]">
              Property operations, connected from the portfolio to each record.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-xs font-semibold uppercase tracking-widest text-[#090a0c] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#090a0c]"
                href="/request?intent=demo"
              >
                Request a demo
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
              <Link
                className="inline-flex min-h-11 items-center px-4 text-xs font-semibold uppercase tracking-widest text-white/90 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                href="/request?intent=information"
              >
                Request information
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[1360px] gap-8 px-6 pb-10 text-center sm:grid-cols-3 sm:gap-10 sm:px-10 sm:pb-12 lg:px-14">
          {heroStats.map((item) => (
            <div className="mx-auto max-w-sm" key={item.label}>
              <p className="font-display text-2xl font-semibold leading-none text-[var(--landing-heading)] sm:text-3xl">
                {item.label}
              </p>
              <p className="mx-auto mt-3 max-w-72 text-sm leading-6 text-[var(--landing-muted)]">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-14 lg:py-28" data-landing-reveal id="workspace">
        <div className="mx-auto max-w-[1360px]">
          <div className="grid gap-8 border-b border-[var(--landing-border)] pb-10 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--landing-subtle)]">
                One operating record
              </p>
              <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold leading-tight text-[var(--landing-heading)] sm:text-4xl">
                See the work that needs a decision.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-[var(--landing-muted)] md:justify-self-end">
              Nestory keeps leases, money, maintenance, documents, and activity connected—then gives each role the view and actions it can legitimately use.
            </p>
          </div>
          <div className="mt-10 lg:mt-12">
            <ControlPreview />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="coordinated-work-title"
        className="border-y border-[var(--landing-border)] bg-[color-mix(in_oklab,var(--landing-bg)_94%,var(--landing-accent))] px-6 py-20 sm:px-10 lg:px-14 lg:py-28"
        data-landing-reveal
        id="operations"
      >
        <div className="mx-auto grid max-w-[1360px] gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.72fr)] lg:items-center">
          <figure className="min-w-0">
            <div className="relative aspect-[3/2] overflow-hidden bg-[var(--landing-media-bg)]">
              <Image
                alt="Property operations team reviewing a building plan and maintenance work order"
                className="object-cover object-center"
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                src="/property-operations-team-editorial.webp"
              />
            </div>
            <figcaption className="mt-3 text-xs leading-5 text-[var(--landing-subtle)]">
              Property, Finance, and Operations working from the same current record.
            </figcaption>
          </figure>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--landing-subtle)]">
              Coordinated property work
            </p>
            <h2
              className="mt-4 font-display text-3xl font-semibold leading-tight text-[var(--landing-heading)] sm:text-4xl"
              id="coordinated-work-title"
            >
              The same record, from request to close.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--landing-muted)]">
              The interface changes by responsibility, while the underlying property story stays intact.
            </p>
            <dl className="mt-8 border-t border-[var(--landing-border)]">
              {coordinatedWork.map((item) => (
                <div className="grid gap-2 border-b border-[var(--landing-border)] py-5 sm:grid-cols-[120px_minmax(0,1fr)]" key={item.label}>
                  <dt className="flex items-center gap-2 font-semibold text-[var(--landing-heading)]">
                    <Check aria-hidden="true" className="text-[var(--landing-accent)]" size={16} />
                    {item.label}
                  </dt>
                  <dd className="text-sm leading-6 text-[var(--landing-muted)]">{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-14 lg:py-28" data-landing-reveal id="start">
        <div className="mx-auto grid max-w-[1360px] gap-10 lg:grid-cols-[minmax(0,0.65fr)_minmax(300px,0.35fr)] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--landing-subtle)]">
              Ready for the operating day
            </p>
            <h2 className="mt-4 max-w-4xl font-display text-3xl font-semibold leading-tight text-[var(--landing-heading)] sm:text-4xl lg:text-5xl">
              Bring the portfolio into one operating record.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--landing-muted)]">
              Nestory provisions each client workspace and its first administrator. Tell us how your portfolio works today.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[var(--landing-cta-bg)] px-6 text-xs font-semibold uppercase tracking-widest text-[var(--landing-cta-fg)] outline-none transition-transform hover:-translate-y-0.5 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)]"
              href="/request?intent=demo"
            >
              Request a demo
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link
              className="inline-flex min-h-12 items-center px-4 text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)] outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)]"
              href="/request?intent=information"
            >
              Request information
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--landing-inverse-border)] bg-[var(--landing-inverse-bg)] px-6 py-10 text-[var(--landing-inverse-fg)] sm:px-10 lg:px-14">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-display text-2xl font-semibold">Nestory</p>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--landing-inverse-muted)]">
              Quiet operating software for properties, leases, rent, maintenance, documents, and reporting.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--landing-inverse-muted)]">
            <Link className="hover:text-[var(--landing-inverse-fg)]" href="/login">Sign in</Link>
            <Link className="hover:text-[var(--landing-inverse-fg)]" href="/request?intent=information">Information</Link>
            <Link className="hover:text-[var(--landing-inverse-fg)]" href="/request?intent=demo">Demo</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function LandingMotion() {
  return (
    <style>{`
      .landing-hero {
        --landing-hero-bottom: linear-gradient(0deg, rgb(5 6 7 / 78%), transparent);
        --landing-hero-image-filter: brightness(0.84) contrast(1.02) saturate(0.86);
        --landing-hero-overlay: linear-gradient(90deg, rgb(5 6 7 / 78%) 0%, rgb(5 6 7 / 36%) 62%, rgb(5 6 7 / 12%) 100%);
      }
      .landing-hero-image { filter: var(--landing-hero-image-filter); }
      .landing-hero-overlay { background: var(--landing-hero-overlay); }
      .landing-hero-bottom { background: var(--landing-hero-bottom); }
      html:has(.landing-page) { scroll-behavior: smooth; }
      .landing-page [data-landing-reveal] {
        opacity: 1;
        transform: none;
      }
      .landing-page[data-motion-ready="true"] [data-landing-reveal] {
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 420ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .landing-page[data-motion-ready="true"] [data-landing-reveal][data-revealed="true"] {
        opacity: 1;
        transform: none;
      }
      .landing-hero-copy { animation: nestory-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      @keyframes nestory-rise {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        html:has(.landing-page) { scroll-behavior: auto; }
        .landing-page *, .landing-page *::before, .landing-page *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }
        .landing-page [data-landing-reveal] { opacity: 1 !important; transform: none !important; }
      }
    `}</style>
  );
}
