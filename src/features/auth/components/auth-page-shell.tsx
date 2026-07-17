import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { NestoryLogo } from "@/components/brand/nestory-logo";
import { AuthThemeToggle } from "@/features/auth/components/auth-theme-toggle";
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
  contextLabel = "Private workspace",
  contextText = "Your operating record stays connected and scoped to your workspace.",
  contextTitle = "Continue where the work is.",
  description,
  switchHref,
  switchLabel,
  switchText,
  title,
  visualSrc,
}: AuthPageShellProps) {
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
              visualSrc ? "text-[var(--auth-page-fg)]" : "text-foreground",
            )}
            href="/"
          >
            <NestoryLogo
              markClassName="h-9 w-9"
              markTone="auto"
              priority
              subtitleClassName={
                visualSrc
                  ? "text-[var(--auth-page-subtle)]"
                  : "text-foreground-subtle"
              }
              textClassName={
                visualSrc ? "text-2xl text-[var(--auth-page-fg)]" : "text-2xl text-foreground"
              }
            />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              className={cn(
                "hidden text-[11px] font-medium uppercase tracking-[0.16em] transition-colors sm:inline-flex",
                visualSrc
                  ? "text-[var(--auth-page-subtle)] hover:text-[var(--auth-page-fg)]"
                  : "text-foreground-subtle hover:text-foreground",
              )}
              href={switchHref ?? "/"}
            >
              {switchLabel ?? "Home"}
            </Link>
            <AuthThemeToggle />
          </div>
        </div>
      </header>

      <section className="mx-auto box-border flex min-h-screen w-full max-w-[1180px] flex-col justify-center gap-10 px-6 pb-12 pt-32 sm:px-10 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center lg:px-14">
        <aside className="auth-shell-context hidden max-w-[560px] lg:block">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.22em]",
              visualSrc ? "text-[var(--auth-page-subtle)]" : "text-foreground-subtle",
            )}
          >
            {contextLabel}
          </p>
          <p
            className={cn(
              "mt-5 font-display text-3xl font-semibold leading-[1.12]",
              visualSrc ? "text-[var(--auth-page-fg)]" : "text-foreground",
            )}
          >
            {contextTitle}
          </p>
          <p
            className={cn(
              "mt-5 max-w-md text-sm leading-6",
              visualSrc ? "text-[var(--auth-page-muted)]" : "text-foreground-muted",
            )}
          >
            {contextText}
          </p>

          <div
            aria-hidden="true"
            className={cn(
              "mt-10 h-px w-24",
              visualSrc ? "bg-[var(--auth-page-line)]" : "bg-border",
            )}
          />
        </aside>

        <div
          className="min-w-0 self-center justify-self-center lg:justify-self-end"
          style={{ maxWidth: "430px", width: "calc(100vw - 48px)" }}
        >
          <div
            className={cn(
              "auth-shell-card box-border w-full rounded-lg border p-5 sm:p-6",
              visualSrc
                ? "border-[color:var(--auth-page-card-border)] bg-surface-muted/90 shadow-[0_20px_70px_rgb(0_0_0/0.16)] backdrop-blur-xl"
                : "border-border bg-surface shadow-sm",
            )}
          >
            <div className="mb-6">
              <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-foreground-muted">
                {description}
              </p>
            </div>

            {children}

            {switchHref && switchLabel && switchText ? (
              <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-foreground-muted">
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
