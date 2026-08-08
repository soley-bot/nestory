import Link from "next/link";
import { KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { signOutAction } from "@/features/auth/actions";
import { formatWorkspaceAccessRole } from "@/features/organization/access-status";
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
    <main className="divide-y divide-border px-4 sm:px-6">
      <section
        role="region"
        aria-labelledby="account-profile-title"
        className="py-5"
      >
        <h2
          className="flex items-center gap-2 text-sm font-semibold"
          id="account-profile-title"
        >
          <UserRound aria-hidden="true" size={15} />
          Profile
        </h2>
        {profile ? (
          <dl className="mt-3 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="mt-3 border-l-2 border-border py-1 pl-4">
            <p className="text-sm font-medium">No linked staff profile</p>
            <p className="mt-1 text-sm text-foreground-muted">
              An administrator can link this account.
            </p>
          </div>
        )}
      </section>

      <section
        role="region"
        aria-labelledby="account-security-title"
        className="py-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            className="flex items-center gap-2 text-sm font-semibold"
            id="account-security-title"
          >
            <KeyRound aria-hidden="true" size={15} />
            Security and sign-in
          </h2>
          <Badge tone="success">Active session</Badge>
        </div>
        <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <AccountFact label="Email" value={identity.email} />
          <AccountFact label="Organization" value={identity.organizationName} />
        </dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-sm text-foreground-muted">
            Use secure email recovery to create or replace your password.
          </p>
          <Link
            className="text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            href="/forgot-password"
          >
            Set or change password
          </Link>
        </div>
      </section>

      <section
        role="region"
        aria-labelledby="account-access-title"
        className="py-5 text-sm"
      >
        <h2
          className="flex items-center gap-2 font-semibold"
          id="account-access-title"
        >
          <ShieldCheck aria-hidden="true" size={15} />
          Access scope
        </h2>
        <p className="mt-1 leading-5 text-foreground-muted">
          {roleEffect(identity.role)}
        </p>
        <dl className="mt-3 divide-y divide-border border-y border-border">
          <AccessFact label="Access level" value={formatWorkspaceAccessRole(identity.role)} />
          <AccessFact
            label="Access scope"
            value={roleScope(identity.role, identity.branchLabel)}
          />
          <AccessFact
            label="Linked staff record"
            value={profile?.displayName ?? "Not linked"}
          />
        </dl>
        {identity.role === "super_admin" ? (
          <div className="mt-3">
            <Link
              className="font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              href="/users-roles"
            >
              Workspace Access
            </Link>
          </div>
        ) : null}
      </section>

      <section
        role="region"
        aria-labelledby="account-session-title"
        className="py-5"
      >
        <h2
          className="flex items-center gap-2 text-sm font-semibold"
          id="account-session-title"
        >
          <LogOut aria-hidden="true" size={15} />
          Session
        </h2>
        <div className="mt-3 max-w-xl border-l-2 border-danger bg-danger-soft px-4 py-3">
          <form action={signOutAction}>
            <button
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-danger/30 bg-surface px-3 text-[13px] font-medium text-danger outline-none hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
              type="submit"
            >
              <LogOut aria-hidden="true" size={14} />
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium" title={value}>{value}</dd>
    </div>
  );
}

function AccessFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-2">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function roleScope(role: WorkspaceRole, branchLabel: string) {
  if (role === "super_admin") return "Organization-wide";
  if (role === "operations_manager") return branchLabel;
  return "Assigned work";
}

function roleEffect(role: WorkspaceRole) {
  if (role === "super_admin") return "Full workspace and settings access.";
  if (role === "operations_manager") return "Operational access within the assigned branch scope.";
  return "Assigned task access through the linked staff profile.";
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
