import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await requireWorkspaceContext();
  const entryPath = getWorkspaceEntryPath(context.role);

  return (
    <main className="workspace-arrival-page relative isolate grid min-h-dvh place-items-center overflow-hidden bg-[var(--workspace-arrival-bg)] text-[var(--workspace-arrival-fg)]">
      <div aria-hidden="true" className="absolute inset-0 -z-20">
        <Image
          alt=""
          className="workspace-arrival-image object-cover object-[42%_center] lg:object-center"
          fill
          preload
          sizes="100vw"
          src="/marketing/login-property-building-blue-hour.png"
        />
      </div>
      <div
        aria-hidden="true"
        className="workspace-arrival-scrim absolute inset-0 -z-10"
      />

      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-24 max-w-[1360px] items-start justify-end px-6 pt-7 sm:px-10 lg:px-14">
          <ThemeToggle className="rounded-md border border-[var(--workspace-arrival-overlay-border)] bg-[var(--workspace-arrival-overlay-bg)] text-[var(--workspace-arrival-overlay-fg)] backdrop-blur-md hover:bg-[var(--workspace-arrival-action-hover)] hover:text-[var(--workspace-arrival-action-fg)]" />
        </div>
      </header>

      <div className="grid w-full max-w-[1180px] place-items-center px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-16 lg:px-14">
        <section
          aria-labelledby="workspace-entry-title"
          className="workspace-arrival-card w-full max-w-md rounded-lg border border-[var(--workspace-arrival-line)] bg-[var(--workspace-arrival-card)] p-6 shadow-[0_20px_70px_var(--workspace-arrival-shadow)] backdrop-blur-xl lg:col-start-2"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--workspace-arrival-muted)]">
            {formatRole(context.role)} workspace
          </p>
          <h1
            className="mt-2 text-xl font-semibold tracking-tight"
            id="workspace-entry-title"
          >
            {context.organizationName}
          </h1>
          <Link
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[var(--workspace-arrival-action)] px-4 text-sm font-semibold text-[var(--workspace-arrival-action-fg)] shadow-[inset_0_0_0_1px_var(--workspace-arrival-action-border)] outline-none transition-colors duration-200 hover:bg-[var(--workspace-arrival-action-hover)] focus-visible:ring-2 focus-visible:ring-[var(--workspace-arrival-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--workspace-arrival-bg)]"
            href={entryPath}
            prefetch={false}
          >
            Open workspace
          </Link>
        </section>
      </div>
    </main>
  );
}

function formatRole(role: "admin" | "manager" | "member") {
  return role === "admin" ? "Administrator" : role === "manager" ? "Manager" : "Team Member";
}
