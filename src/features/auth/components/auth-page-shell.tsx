import type { ReactNode } from "react";
import Link from "next/link";

type AuthPageShellProps = {
  children: ReactNode;
  contextItems?: Array<{
    label: string;
    text: string;
  }>;
  contextLabel?: string;
  contextText?: string;
  contextTitle?: string;
  description: string;
  switchHref?: string;
  switchLabel?: string;
  switchText?: string;
  title: string;
};

const defaultContextItems = [
  {
    label: "Portfolio",
    text: "Properties, units, owners, tenants.",
  },
  {
    label: "Rent",
    text: "Collections, balances, deposits.",
  },
  {
    label: "Operations",
    text: "Leases, maintenance, records.",
  },
];

export function AuthPageShell({
  children,
  contextItems = defaultContextItems,
  contextLabel = "Nestory workspace",
  contextText = "Portfolio, rent, maintenance, documents, and records stay connected.",
  contextTitle = "Property management, kept under control.",
  description,
  switchHref,
  switchLabel,
  switchText,
  title,
}: AuthPageShellProps) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fdfdfc] text-[#080b12]">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto box-border flex h-24 max-w-[1360px] items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
          <Link
            aria-label="Nestory home"
            className="font-display leading-none text-[#060910]"
            href="/"
          >
            <span className="block text-2xl font-semibold">NESTORY</span>
            <span className="mt-0.5 block text-center text-[10px] font-medium uppercase tracking-[0.24em] text-[#9aa0aa]">
              Property Management
            </span>
          </Link>

          <Link
            className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-[#838995] transition-colors hover:text-[#060910] sm:inline-flex"
            href={switchHref ?? "/"}
          >
            {switchLabel ?? "Home"}
          </Link>
        </div>
      </header>

      <section className="mx-auto box-border flex min-h-screen w-full max-w-[1180px] flex-col justify-center gap-10 px-6 pb-12 pt-32 sm:px-10 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center lg:px-14">
        <aside className="hidden max-w-[560px] lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9aa3b2]">
            {contextLabel}
          </p>
          <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.12] text-[#080d1a]">
            {contextTitle}
          </h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-[#6f7887]">{contextText}</p>

          <div className="mt-10 border-t border-[#dfe4ea]">
            {contextItems.map((item) => (
              <div
                className="grid grid-cols-[0.4fr_1fr] gap-8 border-b border-[#dfe4ea] py-5"
                key={item.label}
              >
                <p className="font-display text-lg font-semibold leading-tight text-[#080d1a]">
                  {item.label}
                </p>
                <p className="text-sm leading-6 text-[#7a8394]">{item.text}</p>
              </div>
            ))}
          </div>
        </aside>

        <div
          className="min-w-0 self-center justify-self-center lg:justify-self-end"
          style={{ maxWidth: "430px", width: "calc(100vw - 48px)" }}
        >
          <div className="box-border w-full rounded-lg border border-[#dfe4ea] bg-white p-5 shadow-[0_18px_60px_rgba(8,11,18,0.045)] sm:p-6">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-semibold leading-tight text-[#080b12]">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#6e7681]">{description}</p>
            </div>

            {children}

            {switchHref && switchLabel && switchText ? (
              <p className="mt-5 border-t border-[#edf0f3] pt-5 text-sm leading-6 text-[#6e7681]">
                <span>{switchText} </span>
                <Link
                  className="font-semibold text-[#080b12] transition-opacity hover:opacity-65"
                  href={switchHref}
                >
                  {switchLabel}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
