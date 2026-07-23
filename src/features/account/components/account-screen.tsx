import Link from "next/link";
import { KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { signOutAction } from "@/features/auth/actions";
import type { WorkspaceRole } from "@/lib/auth/context";

export type AccountIdentity = {
  branchLabel: string;
  email: string;
  organizationName: string;
  role: WorkspaceRole;
};

export type AccountProfile = {
  displayName: string;
  email: string | null;
  legalName: string | null;
  partyType: string;
  phone: string | null;
  roles: string[];
};

export function AccountScreen({
  identity,
  profile,
}: {
  identity: AccountIdentity;
  profile: AccountProfile | null;
}) {
  return (
    <main className="grid gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
      <div className="min-w-0 space-y-4">
        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound aria-hidden="true" size={15} />
              Sign-in identity
            </h2>
            <Badge tone="success">Active session</Badge>
          </div>
          <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <AccountFact label="Email" value={identity.email} />
            <AccountFact label="Organization" value={identity.organizationName} />
          </dl>
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserRound aria-hidden="true" size={15} />
              Linked profile
            </h2>
          </div>
          {profile ? (
            <dl className="grid sm:grid-cols-2 lg:grid-cols-3">
              <AccountFact label="Name" value={profile.displayName} />
              <AccountFact label="Legal name" value={profile.legalName ?? "Not set"} />
              <AccountFact label="Profile type" value={formatPartyType(profile.partyType)} />
              <AccountFact label="Profile email" value={profile.email ?? "Not set"} />
              <AccountFact label="Phone" value={profile.phone ?? "Not set"} />
              <AccountFact
                label="People roles"
                value={profile.roles.length > 0 ? profile.roles.map(formatPersonRole).join(", ") : "No role"}
              />
            </dl>
          ) : (
            <div className="px-4 py-6">
              <p className="text-sm font-medium">No linked staff profile</p>
              <p className="mt-1 text-sm text-foreground-muted">
                An administrator can link this account.
              </p>
            </div>
          )}
        </section>
      </div>

      <aside className="min-w-0 space-y-4">
        <ConsequencePanel
          rows={[
            { label: "Access level", value: formatPlatformRole(identity.role) },
            { label: "Access scope", value: roleScope(identity.role, identity.branchLabel) },
            { label: "Linked staff record", value: profile?.displayName ?? "Not linked" },
          ]}
          summary={roleEffect(identity.role)}
          title="Access scope"
        >
          {identity.role === "admin" ? (
            <Link
              className="font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              href="/users-roles"
            >
              Workspace Access
            </Link>
          ) : null}
        </ConsequencePanel>

        <section className="rounded-md border border-border bg-surface-raised p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck aria-hidden="true" size={15} />
            Session
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Signing out ends this browser session.
          </p>
          <form action={signOutAction} className="mt-4">
            <button
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-danger/30 bg-surface px-3 text-[13px] font-medium text-danger outline-none hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
              type="submit"
            >
              <LogOut aria-hidden="true" size={14} />
              Sign out
            </button>
          </form>
        </section>
      </aside>
    </main>
  );
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-border px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium" title={value}>{value}</dd>
    </div>
  );
}

function roleScope(role: WorkspaceRole, branchLabel: string) {
  if (role === "admin") return "Organization-wide";
  if (role === "manager") return branchLabel;
  return "Assigned work";
}

function roleEffect(role: WorkspaceRole) {
  if (role === "admin") return "Full workspace and settings access.";
  if (role === "manager") return "Operational access within the assigned branch scope.";
  return "Assigned task access through the linked staff profile.";
}

function formatPlatformRole(role: WorkspaceRole) {
  return role === "admin" ? "Administrator" : role === "manager" ? "Manager" : "Team Member";
}

function formatPartyType(value: string) {
  return value === "company" ? "Company" : "Individual";
}

function formatPersonRole(value: string) {
  if (value === "tenant") return "Tenant";
  if (value === "owner") return "Owner";
  if (value === "vendor") return "Vendor";
  return "Staff";
}
