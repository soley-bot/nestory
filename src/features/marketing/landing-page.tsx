import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LandingHeader } from "./components/landing-header";
import { RecordRoomPreview } from "./components/record-room-preview";

const heroStats = [
  {
    label: "Portfolio",
    text: "properties, units, owners, tenants, and documents organized from one workspace",
  },
  {
    label: "Payments",
    text: "rent collection, balances, and USD/KHR context kept visible for operators",
  },
  {
    label: "Maintenance",
    text: "requests, vendors, inspections, and unit condition tracked with the property",
  },
];

const operations = [
  {
    description: "See every property, building, unit, tenant, and owner relationship without spreadsheet hunting.",
    href: "/properties",
    title: "Portfolio",
  },
  {
    description: "Manage lease dates, tenant status, move-ins, renewals, deposits, and supporting documents.",
    href: "/leases",
    title: "Leasing",
  },
  {
    description: "Track payments, outstanding balances, unit-level performance, and monthly collection health.",
    href: "/ledger",
    title: "Payments",
  },
  {
    description: "Turn repairs, inspections, tasks, and service events into clear property operations.",
    href: "/maintenance",
    title: "Maintenance",
  },
];

const methodSteps = [
  {
    body: "Create the portfolio map: properties, units, owners, tenants, leases, and documents.",
    label: "01",
    title: "Set up",
  },
  {
    body: "Run daily work from one PMS: payments, maintenance, documents, and operator notes.",
    label: "02",
    title: "Operate",
  },
  {
    body: "Review occupancy, balances, overdue work, lease changes, and unit performance.",
    label: "03",
    title: "Control",
  },
  {
    body: "Keep the history behind every operational decision, without making history the whole product.",
    label: "04",
    title: "Trace",
  },
];

const proofStats = [
  ["500+", "units seeded for realistic PMS-scale screen checks"],
  ["790", "operational timeline events available behind the portfolio"],
  ["686", "ledger entries separated from summary calculations"],
  ["1", "simple admin workspace to start, before heavy role complexity"],
];

const portfolioImage =
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1800&q=80";
const unitsImage =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80";
const leasingImage =
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80";

export function LandingPage() {
  return (
    <main className="bg-white text-[#080b12]">
      <LandingHeader />

      <section className="relative flex min-h-[78svh] flex-col px-6 pt-24 sm:min-h-[86svh] sm:px-10 sm:pt-28 lg:px-14">
        <div className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center py-14 sm:py-20">
          <h1 className="font-display max-w-6xl text-center text-4xl font-semibold leading-[1.04] sm:text-6xl lg:text-7xl">
            Property Management System for growing portfolios.
          </h1>
        </div>

        <div className="mx-auto grid w-full max-w-7xl gap-6 pb-8 text-center sm:grid-cols-3 sm:gap-8 sm:pb-12">
          {heroStats.map((item) => (
            <div key={item.label}>
              <p className="font-display text-3xl font-semibold leading-none sm:text-5xl">
                {item.label}
              </p>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-[#6e7681]">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[#edf0f3] px-6 py-20 sm:px-10 lg:px-14" id="platform">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between gap-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
              Property Management System
            </p>
            <p className="hidden text-sm text-[#6e7681] sm:block">Portfolio, operations, and records</p>
          </div>

          <div className="relative min-h-[540px] overflow-hidden rounded-md bg-[#080b12]">
            <Image
              alt="High-rise property portfolio placeholder"
              className="object-cover opacity-78"
              fill
              priority
              sizes="(min-width: 1024px) 1200px, 100vw"
              src={portfolioImage}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080b12]/70 via-[#080b12]/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 grid gap-8 p-6 text-white sm:p-10 lg:grid-cols-[1fr_420px] lg:p-12">
              <div>
                <h2 className="font-display max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl">
                  Manage the portfolio, not just the paperwork.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-white/72">
                  Nestory is positioned as a full PMS for Cambodian property teams:
                  portfolio control, leasing, payments, maintenance, documents, and
                  the operational history underneath it all.
                </p>
              </div>
              <div className="self-end border-t border-white/30 pt-5">
                <Link
                  className="inline-flex items-center gap-2 text-sm font-semibold uppercase text-white transition-opacity hover:opacity-75"
                  href="/signup"
                >
                  Create account
                  <ArrowRight size={16} strokeWidth={1.8} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-14">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.52fr_0.48fr] lg:items-end">
          <div>
            <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              The system operators open every morning.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#6e7681]">
              The app still keeps a complete history, but the front door is broader:
              units, leases, rent, tasks, documents, owners, tenants, and reports.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PhotoTile alt="Modern residential unit placeholder" label="Units" src={unitsImage} />
            <PhotoTile alt="Real estate leasing placeholder" label="Leasing" src={leasingImage} />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
                PMS workspace
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#6e7681]">
                A practical operating system for property managers: portfolio status,
                rent collection, maintenance, documents, and linked history in one place.
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center gap-2 text-sm font-semibold uppercase text-[#080b12] transition-opacity hover:opacity-65"
              href="/signup"
            >
              Create account
              <ArrowRight size={16} strokeWidth={1.8} />
            </Link>
          </div>

          <RecordRoomPreview />
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-14" id="operations">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.42fr_0.58fr]">
          <div>
            <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              Operations
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-[#6e7681]">
              The product story should feel like a PMS: one place to run the property
              business, with record history built in.
            </p>
          </div>

          <div className="border-t border-[#dfe4ea]">
            {operations.map((item) => (
              <Link
                className="group grid gap-4 border-b border-[#dfe4ea] py-7 text-[#080b12] transition-opacity hover:opacity-70 sm:grid-cols-[0.42fr_1fr_32px] sm:items-center"
                href={item.href}
                key={item.title}
              >
                <h3 className="font-display text-3xl font-semibold leading-tight">{item.title}</h3>
                <p className="text-sm leading-6 text-[#6e7681]">{item.description}</p>
                <ArrowRight
                  className="transition-transform group-hover:translate-x-1"
                  size={20}
                  strokeWidth={1.7}
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#07090d] px-6 py-24 text-white sm:px-10 lg:px-14" id="method">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-5xl">
            <h2 className="font-display text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
              PMS first. History built into every action.
            </h2>
            <p className="mt-8 max-w-2xl text-base leading-7 text-white/55">
              Nestory can grow into a broader property management system without losing
              the timeline and ledger foundation that makes the data trustworthy.
            </p>
          </div>

          <div className="mt-20 grid gap-8 border-t border-white/14 pt-8 md:grid-cols-4">
            {methodSteps.map((step) => (
              <article key={step.label}>
                <p className="text-sm font-semibold text-white/35">{step.label}</p>
                <h3 className="font-display mt-5 text-2xl font-semibold">{step.title}</h3>
                <p className="mt-4 text-sm leading-6 text-white/55">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-14">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.38fr_0.62fr]">
          <div>
            <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              Scale
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-[#6e7681]">
              The interface is being shaped around PMS-scale data, not a small demo.
            </p>
          </div>

          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {proofStats.map(([value, text]) => (
              <div className="border-t border-[#dfe4ea] pt-5" key={value}>
                <p className="font-display text-5xl font-semibold leading-none">{value}</p>
                <p className="mt-4 text-sm leading-6 text-[#6e7681]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 pt-10 sm:px-10 lg:px-14" id="start">
        <div className="mx-auto max-w-7xl border-t border-[#dfe4ea] pt-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:items-end">
            <h2 className="font-display max-w-4xl text-5xl font-semibold leading-[1.05] sm:text-6xl">
              A calmer way to run property operations.
            </h2>
            <div>
              <Link
                className="inline-flex h-12 items-center gap-2 bg-[#080b12] px-5 text-sm font-semibold uppercase text-white transition-opacity hover:opacity-80"
                href="/signup"
              >
                Create admin account
                <ArrowRight size={16} strokeWidth={1.8} />
              </Link>
              <p className="mt-4 text-sm leading-6 text-[#6e7681]">
                Start with one PMS workspace and expand the operating modules from there.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-6 pb-10 sm:px-10 lg:px-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 border-t border-[#edf0f3] pt-8 text-sm text-[#6e7681] md:flex-row md:items-center md:justify-between">
          <p>&copy; 2026 Nestory</p>
          <div className="flex flex-wrap gap-6">
            <a className="transition-colors hover:text-[#080b12]" href="#platform">
              Platform
            </a>
            <a className="transition-colors hover:text-[#080b12]" href="#operations">
              Operations
            </a>
            <Link className="transition-colors hover:text-[#080b12]" href="/login">
              Sign in
            </Link>
            <Link className="transition-colors hover:text-[#080b12]" href="/signup">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PhotoTile({
  alt,
  label,
  src,
}: {
  alt: string;
  label: string;
  src: string;
}) {
  return (
    <figure className="group relative min-h-[300px] overflow-hidden rounded-md bg-[#080b12]">
      <Image
        alt={alt}
        className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        fill
        sizes="(min-width: 1024px) 300px, 50vw"
        src={src}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#080b12]/55 via-transparent to-transparent" />
      <figcaption className="absolute bottom-5 left-5 text-sm font-semibold uppercase tracking-[0.16em] text-white">
        {label}
      </figcaption>
    </figure>
  );
}
