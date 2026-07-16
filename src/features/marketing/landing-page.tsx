import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  FileText,
  Landmark,
  ScrollText,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { LandingHeader } from "./components/landing-header";
import { LandingScrollMotion } from "./components/landing-scroll-motion";
import { ControlPreview } from "./components/control-preview";

const heroStats = [
  {
    label: "Portfolio",
    text: "properties, units, owners, tenants",
  },
  {
    label: "Rent",
    text: "collections, balances, deposits",
  },
  {
    label: "Operations",
    text: "leases, maintenance, records",
  },
];

const heroImage = {
  alt: "Modern apartment building at dusk",
  src: "/marketing/property-operations-building-dusk.png",
};

const heroToneStyle = {
  "--landing-heading": "#ffffff",
  "--landing-muted": "rgb(255 255 255 / 72%)",
} as CSSProperties;

const photoTiles = [
  {
    alt: "Managed apartment building facade",
    src: "/marketing/workspace-building-facade.png",
  },
  {
    alt: "Apartment unit corridor",
    src: "/marketing/workspace-unit-corridor.png",
  },
  {
    alt: "Property keys and document folders",
    src: "/marketing/workspace-keys-documents.png",
  },
  {
    alt: "Apartment building maintenance service area",
    src: "/marketing/workspace-maintenance-service.png",
  },
];

const operationModules: Array<{
  description: string;
  href: string;
  icon: LucideIcon;
  signal: string;
  title: string;
}> = [
  {
    description: "Properties, units, owners, tenants",
    href: "/properties",
    icon: Building2,
    signal: "Portfolio record",
    title: "Portfolio",
  },
  {
    description: "Move-ins, renewals, deposits",
    href: "/leases",
    icon: ScrollText,
    signal: "Lease backbone",
    title: "Leasing",
  },
  {
    description: "Collections, balances, expenses",
    href: "/ledger",
    icon: Landmark,
    signal: "Money movement",
    title: "Rent & accounting",
  },
  {
    description: "Requests, vendors, inspections",
    href: "/maintenance",
    icon: Wrench,
    signal: "Open work",
    title: "Maintenance",
  },
  {
    description: "Agreements, invoices, receipts",
    href: "/documents",
    icon: FileText,
    signal: "Private files",
    title: "Documents",
  },
  {
    description: "Occupancy, collections, open repairs",
    href: "/reports",
    icon: BookOpen,
    signal: "Traceable output",
    title: "Reporting",
  },
];

const recordFlow = [
  ["Property", "Central Residence"],
  ["Unit", "12B"],
  ["Lease", "Active, renews Sep"],
  ["Ledger", "Rent received"],
  ["Maintenance", "AC vendor waiting"],
  ["Documents", "Lease + receipt linked"],
] as const;

const systemProof = [
  {
    description: "portfolio scale without splitting work across files",
    label: "units",
    value: "500+",
  },
  {
    description: "people, leases, documents, and activity history",
    label: "records",
    value: "790",
  },
  {
    description: "rent, expenses, deposits, and month-close history",
    label: "ledger entries",
    value: "686",
  },
  {
    description: "one admin workspace controlling the operating record",
    label: "workspace",
    value: "1",
  },
];

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
          alt={heroImage.alt}
          className="landing-hero-image absolute inset-0 -z-30 object-cover"
          fill
          priority
          sizes="100vw"
          src={heroImage.src}
          style={{
            objectPosition: "center 46%",
            transform: "scale(1.06)",
          }}
        />
        <div
          aria-hidden="true"
          className="landing-hero-overlay absolute inset-0 -z-20"
        />
        <div
          aria-hidden="true"
          className="landing-hero-bottom absolute inset-x-0 bottom-0 -z-10 h-52"
        />

        <div className="mx-auto flex w-full max-w-[1360px] flex-1 items-center px-6 py-16 sm:px-10 lg:px-14">
          <div
            className="max-w-3xl"
            style={{ animation: "nestory-rise 900ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
          >
            <h1 className="font-display text-4xl font-semibold leading-[1.08] text-[var(--landing-heading)] drop-shadow-[0_2px_18px_rgb(0_0_0_/_30%)] sm:text-5xl lg:text-6xl">
              What if your whole portfolio stayed under control?
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--landing-muted)]">
              Property operations, connected from the portfolio to each record.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#090a0c] transition-transform hover:-translate-y-0.5"
                href="/signup"
              >
                Create workspace
                <ArrowRight size={15} />
              </Link>
              <a
                className="inline-flex h-11 items-center px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75 hover:text-white"
                href="#control"
              >
                See workspace
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[1360px] gap-8 px-6 pb-10 text-center sm:grid-cols-3 sm:gap-10 sm:px-10 sm:pb-12 lg:px-14">
          {heroStats.map((item, index) => (
            <div
              className="mx-auto max-w-sm"
              key={item.label}
              style={{
                animation: "nestory-rise 850ms cubic-bezier(0.22, 1, 0.36, 1) both",
                animationDelay: `${160 + index * 110}ms`,
              }}
            >
              <p className="font-display text-2xl font-semibold leading-none text-[var(--landing-heading)] sm:text-3xl">
                {item.label}
              </p>
              <p className="mx-auto mt-3 max-w-[18rem] text-sm leading-6 text-[var(--landing-muted)]">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-14" data-landing-reveal id="workspace">
        <div className="mx-auto max-w-[1360px]">
          <SectionIntro
            actionHref="#control"
            actionLabel="Discover"
            kicker=""
            subtitle="Portfolio, leases, rent, maintenance, and records in one calm place."
            title="Workspace"
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-4 lg:items-end">
            {photoTiles.map((tile, index) => (
              <PhotoTile
                {...tile}
                className={
                  index === 0
                    ? "lg:min-h-[540px]"
                    : index === 1
                      ? "lg:min-h-[475px] lg:translate-y-8"
                      : index === 2
                        ? "lg:min-h-[405px] lg:translate-y-16"
                        : "lg:min-h-[540px]"
                }
                index={index}
                key={tile.alt}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 sm:px-10 lg:px-14" data-landing-reveal id="control">
        <div className="mx-auto max-w-[1360px]">
          <SectionIntro
            actionHref="/signup"
            actionLabel="Start"
            kicker=""
            subtitle="Occupied, owed, open, late, changing. Clear at a glance."
            title="Control"
          />
          <div className="mx-auto mt-12 max-w-5xl">
            <ControlPreview />
          </div>
        </div>
      </section>

      <section className="px-6 py-24 sm:px-10 lg:px-14" data-landing-reveal id="operations">
        <div className="mx-auto max-w-[1360px]">
          <SectionIntro
            actionHref="/signup"
            actionLabel="Start"
            kicker=""
            subtitle="A property, unit, lease, ledger row, repair, and document can stay in the same operating story."
            title="Operations"
          />

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.42fr_minmax(0,1fr)] lg:items-start">
            <div className="border-y border-[var(--landing-border)] py-7">
              <div className="flex items-center gap-3 text-[var(--landing-heading)]">
                <span className="grid size-10 place-items-center rounded-lg border border-[var(--landing-border)]">
                  <ClipboardList size={18} strokeWidth={1.7} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-subtle)]">
                    Unit record
                  </p>
                  <h3 className="mt-1 font-display text-2xl font-semibold leading-tight">
                    One thread of work
                  </h3>
                </div>
              </div>

              <div className="mt-8 space-y-0 border-t border-[var(--landing-border)]">
                {recordFlow.map(([label, value]) => (
                  <div
                    className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 border-b border-[var(--landing-border)] py-4 text-sm"
                    key={label}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--landing-subtle)]">
                      {label}
                    </p>
                    <p className="min-w-0 text-[var(--landing-heading)]">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--landing-border)]">
              {operationModules.map((item) => (
                <Link
                  className="group grid grid-cols-[44px_minmax(0,1fr)_24px] gap-x-4 gap-y-3 border-b border-[var(--landing-border)] py-6 text-[var(--landing-heading)] transition-opacity hover:opacity-75 md:grid-cols-[44px_minmax(220px,0.36fr)_minmax(0,1fr)_32px] md:items-center"
                  href={item.href}
                  key={item.title}
                >
                  <span className="grid size-10 place-items-center rounded-lg border border-[var(--landing-border)] text-[var(--landing-muted)] transition-colors group-hover:text-[var(--landing-heading)]">
                    <item.icon size={18} strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-xl font-semibold leading-tight sm:text-2xl">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--landing-subtle)]">
                      {item.signal}
                    </span>
                  </span>
                  <span className="col-start-2 max-w-xl text-sm leading-6 text-[var(--landing-muted)] md:col-start-auto">
                    {item.description}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="col-start-3 row-start-1 justify-self-end text-[var(--landing-subtle)] transition-transform group-hover:translate-x-1 md:col-start-auto md:row-start-auto md:justify-self-auto"
                    size={20}
                    strokeWidth={1.6}
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:px-10 sm:py-20 lg:px-14" data-landing-reveal id="method">
        <div className="mx-auto max-w-[1360px] border-t border-[var(--landing-border)] py-14 sm:py-16">
          <div className="grid gap-12 lg:grid-cols-[0.42fr_minmax(0,1fr)] lg:items-start">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--landing-subtle)]">
                Operating proof
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.1] text-[var(--landing-heading)] sm:text-4xl">
                Every operation leaves a record.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[var(--landing-muted)]">
                Nestory is built around the work that usually gets scattered:
                unit status, lease movement, rent history, repair work, files,
                and the timeline behind each decision.
              </p>
            </div>
            <Link
              className="inline-flex items-center gap-2 justify-self-start text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-accent)] transition-opacity hover:opacity-70 lg:justify-self-end"
              href="/signup"
            >
              Create workspace
              <ArrowRight size={16} strokeWidth={1.7} />
            </Link>
          </div>

          <div className="mt-12 grid border-t border-[var(--landing-border)] sm:grid-cols-2 lg:grid-cols-4">
            {systemProof.map((item) => (
              <div
                className="border-b border-[var(--landing-border)] py-7 sm:px-6 sm:first:pl-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
                key={item.label}
              >
                <p className="font-display text-3xl font-semibold leading-none text-[var(--landing-heading)] sm:text-4xl">
                  {item.value}
                </p>
                <p className="mt-4 text-[11px] font-semibold uppercase leading-5 tracking-[0.2em] text-[var(--landing-subtle)]">
                  {item.label}
                </p>
                <p className="mt-3 max-w-56 text-sm leading-6 text-[var(--landing-muted)]">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-14 pt-8 sm:px-10 sm:pb-16 lg:px-14" data-landing-reveal id="start">
        <div className="mx-auto grid max-w-[1360px] gap-8 border-t border-[var(--landing-border)] py-14 lg:grid-cols-[minmax(0,0.58fr)_minmax(280px,0.42fr)] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--landing-subtle)]">
              Start workspace
            </p>
            <h2 className="mt-4 font-display max-w-4xl text-3xl font-semibold leading-[1.1] text-[var(--landing-heading)] sm:text-4xl">
              Bring the portfolio into one operating record.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-[var(--landing-muted)]">
              Start with the admin workspace, then connect properties, units,
              leases, rent, maintenance, and files as the records come online.
            </p>
          </div>
          <div className="lg:justify-self-end">
            <Link
              className="inline-flex h-14 items-center gap-3 rounded-full bg-[var(--landing-cta-bg)] px-8 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--landing-cta-fg)] transition-transform hover:-translate-y-0.5 hover:opacity-90"
              href="/signup"
            >
              Create workspace
              <ArrowRight size={17} strokeWidth={1.8} />
            </Link>
            <p className="mt-5 text-sm italic leading-6 text-[var(--landing-muted)]">
              Start with one clean admin workspace.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--landing-inverse-border)] bg-[var(--landing-inverse-bg)] px-6 py-14 text-[var(--landing-inverse-fg)] sm:px-10 lg:px-14" data-landing-reveal>
        <div className="mx-auto max-w-[1360px]">
          <div className="grid gap-10 border-b border-[var(--landing-inverse-border)] pb-12 lg:grid-cols-[minmax(0,0.52fr)_minmax(360px,0.48fr)]">
            <div>
              <p className="font-display text-2xl font-semibold leading-none">Nestory</p>
              <p className="mt-5 max-w-md text-sm leading-6 text-[var(--landing-inverse-muted)]">
                Property operations software for portfolios, leases, rent,
                maintenance, documents, and reporting.
              </p>
            </div>

            <div className="grid gap-8 text-sm sm:grid-cols-3 lg:justify-self-end lg:text-left">
              <nav className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-inverse-accent)]">
                  Product
                </p>
                <a className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="#workspace">
                  Workspace
                </a>
                <a className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="#control">
                  Control
                </a>
                <a className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="#operations">
                  Operations
                </a>
              </nav>
              <nav className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-inverse-accent)]">
                  Records
                </p>
                <Link className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="/properties">
                  Properties
                </Link>
                <Link className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="/maintenance">
                  Maintenance
                </Link>
                <Link className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="/reports">
                  Reports
                </Link>
              </nav>
              <nav className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-inverse-accent)]">
                  Access
                </p>
                <Link className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="/login">
                  Sign in
                </Link>
                <Link className="block text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)]" href="/signup">
                  Create workspace
                </Link>
              </nav>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-6 text-sm text-[var(--landing-inverse-muted)] md:flex-row md:items-center md:justify-between">
            <p>&copy; 2026 Nestory</p>
            <p>One workspace for the operating record.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function SectionIntro({
  actionHref,
  actionLabel,
  kicker,
  subtitle,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  kicker: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,680px)_1fr] md:items-end">
      <div>
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--landing-accent)]">
            {kicker}
          </p>
        ) : null}
        <h2 className="font-display text-3xl font-semibold leading-[1.1] text-[var(--landing-heading)] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--landing-muted)]">{subtitle}</p>
      </div>
      <Link
        className="inline-flex items-center gap-2 justify-self-start text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-accent)] transition-opacity hover:opacity-70 md:justify-self-end"
        href={actionHref}
      >
        {actionLabel}
        <ArrowRight size={16} strokeWidth={1.7} />
      </Link>
    </div>
  );
}

function PhotoTile({
  alt,
  className,
  index,
  src,
}: {
  alt: string;
  className: string;
  index: number;
  src: string;
}) {
  return (
    <figure
      className="group"
      style={{
        animation: "nestory-rise 800ms cubic-bezier(0.22, 1, 0.36, 1) both",
        animationDelay: `${index * 90}ms`,
      }}
    >
      <div
        className={`relative min-h-[360px] overflow-hidden rounded-lg bg-[var(--landing-media-bg)] ${className}`}
      >
        <Image
          alt={alt}
          className="object-cover transition-transform duration-700 group-hover:scale-[1.035]"
          fill
          sizes="(min-width: 1024px) 24vw, (min-width: 640px) 50vw, 100vw"
          src={src}
        />
      </div>
    </figure>
  );
}

function LandingMotion() {
  return (
    <style>
      {`
        .landing-hero {
          --landing-hero-bg: #101317;
          --landing-hero-bottom: linear-gradient(
            to bottom,
            transparent,
            rgb(5 6 7 / 48%),
            #050607
          );
          --landing-hero-image-filter: brightness(1.06) contrast(0.96) saturate(0.92);
          --landing-hero-overlay: linear-gradient(
            90deg,
            rgb(5 6 7 / 74%) 0%,
            rgb(5 6 7 / 43%) 38%,
            rgb(5 6 7 / 16%) 70%,
            rgb(5 6 7 / 42%) 100%
          );
          background: var(--landing-hero-bg);
        }

        [data-theme="dark"] .landing-hero {
          --landing-hero-bg: #050607;
          --landing-hero-bottom: linear-gradient(
            to bottom,
            transparent,
            rgb(5 6 7 / 66%),
            #050607
          );
          --landing-hero-image-filter: brightness(0.76) contrast(1.08) saturate(0.86);
          --landing-hero-overlay: linear-gradient(
            90deg,
            rgb(5 6 7 / 86%) 0%,
            rgb(5 6 7 / 58%) 38%,
            rgb(5 6 7 / 30%) 70%,
            rgb(5 6 7 / 62%) 100%
          );
        }

        .landing-hero-image {
          filter: var(--landing-hero-image-filter);
          transition: filter 260ms ease;
        }

        .landing-hero-overlay {
          background: var(--landing-hero-overlay);
          transition: background 260ms ease;
        }

        .landing-hero-bottom {
          background: var(--landing-hero-bottom);
          transition: background 260ms ease;
        }

        html:has(.landing-page) {
          scroll-behavior: smooth;
        }

        .landing-page [data-landing-reveal] {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-page[data-motion-ready="true"] [data-landing-reveal] {
          opacity: 0;
          transform: translateY(28px);
          transition:
            opacity 780ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 780ms cubic-bezier(0.22, 1, 0.36, 1);
          transition-delay: calc(var(--landing-reveal-index, 0) * 42ms);
          will-change: opacity, transform;
        }

        .landing-page[data-motion-ready="true"] [data-landing-reveal][data-revealed="true"] {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes nestory-rise {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.001ms !important;
          }

          .landing-page [data-landing-reveal] {
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}
    </style>
  );
}
