import type { ReactNode } from "react";
import Link from "next/link";

type AuthPageShellProps = {
  children: ReactNode;
  description: string;
  switchHref?: string;
  switchLabel?: string;
  switchText?: string;
  title: string;
};

export function AuthPageShell({
  children,
  description,
  switchHref,
  switchLabel,
  switchText,
  title,
}: AuthPageShellProps) {
  return (
    <main className="min-h-screen bg-white text-[#080b12]">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-24 max-w-7xl items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
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
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#838995] transition-colors hover:text-[#060910]"
            href={switchHref ?? "/"}
          >
            {switchLabel ?? "Home"}
          </Link>
        </div>
      </header>

      <section className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center px-6 pb-12 pt-28 sm:px-0 sm:pt-32">
        <div className="w-full rounded-md border border-[#dfe4ea] bg-white p-5 shadow-[0_18px_60px_rgba(8,11,18,0.045)] sm:p-6">
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
      </section>
    </main>
  );
}
