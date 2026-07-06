import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LandingHeader } from "./components/landing-header";
import { RecordRoomPreview } from "./components/record-room-preview";

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

const photoTiles = [
  {
    alt: "High-rise residential portfolio",
    src: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1100&q=82",
  },
  {
    alt: "Modern residential unit with pool",
    src: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1100&q=82",
  },
  {
    alt: "Real estate agreement being reviewed",
    src: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1100&q=82",
  },
  {
    alt: "Building service and maintenance work",
    src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1100&q=82",
  },
];

const modules = [
  {
    description: "Properties, units, owners, tenants.",
    href: "/properties",
    title: "Portfolio",
  },
  {
    description: "Move-ins, renewals, deposits.",
    href: "/leases",
    title: "Leasing",
  },
  {
    description: "Collections, balances, expenses.",
    href: "/ledger",
    title: "Rent & accounting",
  },
  {
    description: "Requests, vendors, inspections.",
    href: "/maintenance",
    title: "Maintenance",
  },
  {
    description: "Agreements, invoices, receipts.",
    href: "/documents",
    title: "Documents",
  },
  {
    description: "Occupancy, collections, open repairs.",
    href: "/reports",
    title: "Reporting",
  },
];

const proofStats = [
  ["500+", "units"],
  ["790", "records"],
  ["686", "ledger entries"],
  ["1", "workspace"],
];

export function LandingPage() {
  return (
    <main className="landing-page bg-[var(--landing-bg)] text-[var(--landing-fg)] transition-colors">
      <LandingMotion />
      <LandingHeader />

      <section className="relative flex min-h-[92svh] flex-col px-6 pt-24 sm:min-h-[96svh] sm:px-10 lg:px-14">
        <div className="mx-auto flex w-full max-w-[1360px] flex-1 items-center justify-center py-16">
          <div
            className="max-w-5xl text-center"
            style={{ animation: "nestory-rise 900ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
          >
            <h1 className="font-display text-4xl font-semibold leading-[1.08] text-[var(--landing-heading)] sm:text-5xl lg:text-6xl">
              What if your whole portfolio stayed under control?
            </h1>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[1360px] gap-8 pb-10 text-center sm:grid-cols-3 sm:gap-10 sm:pb-12">
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

      <section className="px-6 py-20 sm:px-10 lg:px-14" id="workspace">
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

      <section className="px-6 py-24 sm:px-10 lg:px-14" id="control">
        <div className="mx-auto max-w-[1360px]">
          <SectionIntro
            actionHref="/signup"
            actionLabel="Start"
            kicker=""
            subtitle="Occupied, owed, open, late, changing. Clear at a glance."
            title="Control"
          />
          <div className="mt-12">
            <RecordRoomPreview />
          </div>
        </div>
      </section>

      <section className="px-6 py-24 sm:px-10 lg:px-14" id="operations">
        <div className="mx-auto max-w-[1360px]">
          <SectionIntro
            actionHref="/signup"
            actionLabel="Start"
            kicker=""
            subtitle="Core PMS workflows, kept connected."
            title="Operations"
          />

          <div className="mt-12 border-t border-[var(--landing-border)]">
            {modules.map((item) => (
              <Link
                className="group grid gap-4 border-b border-[var(--landing-border)] py-7 text-[var(--landing-heading)] transition-opacity hover:opacity-70 md:grid-cols-[0.42fr_1fr_32px] md:items-center"
                href={item.href}
                key={item.title}
              >
                <h3 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
                  {item.title}
                </h3>
                <p className="max-w-xl text-sm leading-6 text-[var(--landing-muted)]">
                  {item.description}
                </p>
                <ArrowRight
                  aria-hidden="true"
                  className="text-[var(--landing-subtle)] transition-transform group-hover:translate-x-1"
                  size={20}
                  strokeWidth={1.6}
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 sm:px-10 lg:px-14" id="method">
        <div className="mx-auto max-w-[1360px] rounded-lg bg-[var(--landing-inverse-bg)] px-8 py-14 text-[var(--landing-inverse-fg)] sm:px-12 sm:py-16 lg:px-16">
          <div className="grid gap-10 lg:grid-cols-[0.55fr_0.45fr] lg:items-start">
            <div>
              <h2 className="font-display text-3xl font-semibold leading-[1.1] sm:text-4xl">
                One system. Every property operation.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[var(--landing-inverse-muted)]">
                Leases, rent, maintenance, documents, and history stay connected.
              </p>
            </div>
            <Link
              className="inline-flex items-center gap-2 justify-self-start text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-inverse-muted)] transition-colors hover:text-[var(--landing-inverse-fg)] lg:justify-self-end"
              href="/signup"
            >
              Create workspace
              <ArrowRight size={16} strokeWidth={1.7} />
            </Link>
          </div>

          <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {proofStats.map(([value, text]) => (
              <div key={value}>
                <p className="font-display text-3xl font-semibold leading-none sm:text-4xl">{value}</p>
                <p className="mt-5 max-w-48 text-[11px] font-semibold uppercase leading-5 tracking-[0.2em] text-[var(--landing-inverse-accent)]">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 pt-12 sm:px-10 lg:px-14" id="start">
        <div className="mx-auto grid max-w-[1360px] gap-10 border-t border-[var(--landing-border)] pt-20 lg:grid-cols-[0.58fr_0.42fr] lg:items-center">
          <h2 className="font-display max-w-4xl text-3xl font-semibold leading-[1.1] text-[var(--landing-heading)] sm:text-4xl">
            Property management, kept under control.
          </h2>
          <div className="lg:justify-self-end lg:text-center">
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

      <footer className="bg-[var(--landing-inverse-bg)] px-6 py-16 text-[var(--landing-inverse-fg)] sm:px-10 lg:px-14">
        <div className="mx-auto max-w-[1360px]">
          <nav className="flex flex-col items-center gap-2 border-b border-[var(--landing-inverse-border)] pb-14 text-center font-display text-2xl font-semibold leading-tight text-[var(--landing-inverse-muted)] sm:text-3xl">
            <a className="transition-colors hover:text-[var(--landing-inverse-fg)]" href="#workspace">
              Workspace
            </a>
            <a className="transition-colors hover:text-[var(--landing-inverse-fg)]" href="#operations">
              Operations
            </a>
            <a className="transition-colors hover:text-[var(--landing-inverse-fg)]" href="#control">
              Control
            </a>
            <Link className="transition-colors hover:text-[var(--landing-inverse-fg)]" href="/signup">
              Start workspace
            </Link>
          </nav>
          <div className="mt-10 flex flex-col gap-6 text-sm text-[var(--landing-inverse-muted)] md:flex-row md:items-center md:justify-between">
            <p>&copy; 2026 Nestory</p>
            <div className="flex flex-wrap gap-6">
              <Link className="transition-colors hover:text-[var(--landing-inverse-fg)]" href="/login">
                Sign in
              </Link>
              <Link className="transition-colors hover:text-[var(--landing-inverse-fg)]" href="/signup">
                Create workspace
              </Link>
            </div>
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
        }
      `}
    </style>
  );
}
