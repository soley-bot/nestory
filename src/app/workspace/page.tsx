import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await requireWorkspaceContext();
  const entryPath = getWorkspaceEntryPath(context.role);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <section
        aria-labelledby="workspace-entry-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface-raised p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground-subtle">
          {formatRole(context.role)} workspace
        </p>
        <h1
          className="mt-2 text-xl font-semibold tracking-tight"
          id="workspace-entry-title"
        >
          {context.organizationName}
        </h1>
        <Link
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href={entryPath}
          prefetch={false}
        >
          Open workspace
        </Link>
      </section>
    </main>
  );
}

function formatRole(role: "admin" | "manager" | "member") {
  return role === "admin" ? "Admin" : role === "manager" ? "Manager" : "Member";
}
