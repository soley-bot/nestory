import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { NestoryLogo } from "@/components/brand/nestory-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type AuthPageShellProps = {
  children: ReactNode;
  contextLabel?: string;
  contextText?: string;
  contextTitle?: string;
  description: string;
  switchHref?: string;
  switchLabel?: string;
  switchText?: string;
  title: string;
  visualSrc?: string;
};

export function AuthPageShell({
  children,
  contextLabel,
  contextText,
  contextTitle,
  description,
  switchHref,
  switchLabel,
  switchText,
  title,
  visualSrc,
}: AuthPageShellProps) {
  // Only the front door carries a standing message. Mid-task screens — recovery,
  // verification, accepting an invitation — render the card alone.
  const hasContext = Boolean(contextLabel || contextTitle || contextText);
  return (
    <main
      className={cn(
        "relative isolate min-h-screen overflow-x-hidden bg-background text-foreground",
        visualSrc && "auth-photo-page",
      )}
    >
      {visualSrc ? (
        <div className="absolute inset-0 -z-10">
          <Image
            alt=""
            aria-hidden="true"
            className="object-cover"
            fill
            priority
            sizes="100vw"
            src={visualSrc}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "var(--auth-page-scrim)" }}
          />
        </div>
      ) : null}

      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto box-border flex h-24 max-w-[1360px] items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
          <Link
            aria-label="Nestory home"
            className={cn(
              "leading-none",
              visualSrc
                ? "rounded-sm bg-[#0b1218] px-2 py-1.5 text-[var(--auth-page-fg)]"
                : "text-foreground",
            )}
            href="/"
          >
            <NestoryLogo
              markClassName="h-9 w-9"
              markTone={visualSrc ? "light" : "auto"}
              priority
              subtitleClassName={
                visualSrc
                  ? "text-[var(--auth-page-subtle)]"
                  : "text-muted-foreground"
              }
              textClassName={
                visualSrc ? "text-2xl text-[var(--auth-page-fg)]" : "text-2xl text-foreground"
              }
            />
          </Link>

          <div className="flex items-center gap-3 rounded-md border border-[color:var(--auth-page-header-border)] bg-[var(--auth-page-header-bg)] px-2 py-1 backdrop-blur-md">
            <Link
              className={cn(
                "hidden text-xs font-medium uppercase tracking-[0.16em] transition-colors sm:inline-flex",
                visualSrc
                  ? "text-[var(--auth-page-fg)] hover:opacity-80"
                  : "text-muted-foreground hover:text-foreground",
              )}
              href={switchHref ?? "/"}
            >
              {switchLabel ?? "Home"}
            </Link>
            <ThemeToggle className="text-[var(--auth-page-subtle)] hover:bg-[var(--auth-page-line)] hover:text-[var(--auth-page-fg)]" />
          </div>
        </div>
      </header>

      <section
        className={cn(
          "mx-auto box-border flex min-h-screen w-full max-w-[1180px] flex-col justify-center gap-10 px-6 pb-12 pt-32 sm:px-10 lg:items-center lg:px-14",
          hasContext
            ? "lg:grid lg:grid-cols-[minmax(0,1fr)_430px]"
            : "lg:flex lg:justify-center",
        )}
      >
        {hasContext ? (
          <aside className="auth-shell-context hidden max-w-[560px] lg:block">
            {contextLabel ? (
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.22em]",
                  visualSrc
                    ? "text-[var(--auth-page-subtle)]"
                    : "text-muted-foreground",
                )}
              >
                {contextLabel}
              </p>
            ) : null}
            {contextTitle ? (
              <p
                className={cn(
                  "mt-5 font-display text-3xl font-semibold leading-[1.12]",
                  visualSrc ? "text-[var(--auth-page-fg)]" : "text-foreground",
                )}
              >
                {contextTitle}
              </p>
            ) : null}
            {contextText ? (
              <p
                className={cn(
                  "mt-5 max-w-md text-sm font-medium leading-6",
                  visualSrc
                    ? "text-[var(--auth-page-muted)]"
                    : "text-muted-foreground",
                )}
              >
                {contextText}
              </p>
            ) : null}

            <div
              aria-hidden="true"
              className={cn(
                "mt-10 h-px w-24",
                visualSrc ? "bg-[var(--auth-page-line)]" : "bg-border",
              )}
            />
          </aside>
        ) : null}

        <div
          className={cn(
            "min-w-0 self-center justify-self-center",
            hasContext && "lg:justify-self-end",
          )}
          style={{ maxWidth: "430px", width: "calc(100vw - 48px)" }}
        >
          <div
            className={cn(
              "auth-shell-card box-border w-full rounded-lg border p-5 sm:p-6",
              visualSrc
                ? "border-[color:var(--auth-page-card-border)] bg-[var(--auth-page-card-bg)] shadow-[0_20px_70px_rgb(0_0_0/0.16)] backdrop-blur-xl"
                : "border-border bg-card shadow-sm",
            )}
          >
            <div className="mb-6">
              <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>

            {children}

            {switchHref && switchLabel && switchText ? (
              <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
                <span>{switchText} </span>
                <Link
                  className="font-semibold text-foreground transition-opacity hover:opacity-65"
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
