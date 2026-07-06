import Link from "next/link";
import { Mail, MapPin, Shield, UserRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { signOutAction } from "@/features/auth/actions";
import { requireWorkspaceContext, type WorkspaceRole } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type AccountPerson = {
  displayName: string;
  email: string | null;
  legalName: string | null;
  partyType: string;
  phone: string | null;
  roles: string[];
};

type AccountBranch = {
  code: string;
  name: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export default async function AccountPage() {
  const context = await requireWorkspaceContext();
  const { branch, person } = await getAccountProfile({
    branchId: context.branchId,
    organizationId: context.organizationId,
    personId: context.personId,
  });

  return (
    <div>
      <PageHeader
        description="Your own login, organization role, and linked staff profile."
        title="Profile"
      />
      <main className="space-y-4 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Shield size={15} />
              Login access
            </h2>
          </div>
          <div className="grid gap-3 px-3 py-3 md:grid-cols-3">
            <AccountFact label="Login email" value={context.userEmail ?? "No email"} />
            <AccountFact label="Organization" value={context.organizationName} />
            <div className="min-w-0 rounded-md border border-border px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                Role
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge tone={getRoleTone(context.role)}>
                  {formatPlatformRole(context.role)}
                </Badge>
                <span className="truncate text-sm text-muted">
                  {getRoleScope(context.role, branch)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserRound size={15} />
              Linked profile
            </h2>
          </div>
          {person ? (
            <div className="grid gap-3 px-3 py-3 md:grid-cols-2 xl:grid-cols-4">
              <AccountFact label="Name" value={person.displayName} />
              <AccountFact label="Legal name" value={person.legalName ?? "Not set"} />
              <AccountFact label="Profile type" value={formatPartyType(person.partyType)} />
              <div className="min-w-0 rounded-md border border-border px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                  People roles
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {person.roles.length > 0 ? (
                    person.roles.map((role) => (
                      <Badge key={role} tone="accent">
                        {formatPersonRole(role)}
                      </Badge>
                    ))
                  ) : (
                    <Badge tone="warning">No role</Badge>
                  )}
                </div>
              </div>
              <AccountFact icon={Mail} label="Profile email" value={person.email ?? "Not set"} />
              <AccountFact label="Phone" value={person.phone ?? "Not set"} />
              <AccountFact
                icon={MapPin}
                label="Branch"
                value={branch ? `${branch.code} - ${branch.name}` : "All branches"}
              />
            </div>
          ) : (
            <div className="px-3 py-3">
              <p className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5 text-sm text-muted">
                No staff/person profile is linked to your login yet.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Session</p>
              <p className="mt-1 text-sm text-muted">
                Use sign out when sharing a workstation.
              </p>
            </div>
            <div className="flex gap-2">
              {context.role === "admin" ? (
                <Link
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-[13px] font-medium hover:bg-surface-muted"
                  href="/users-roles"
                >
                  Users & Roles
                </Link>
              ) : null}
              <form action={signOutAction}>
                <button
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-[13px] font-medium text-danger hover:bg-surface-muted"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

async function getAccountProfile({
  branchId,
  organizationId,
  personId,
}: {
  branchId?: string;
  organizationId: string;
  personId?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const [branch, person] = await Promise.all([
    branchId ? loadBranch(supabase, organizationId, branchId) : null,
    personId ? loadPerson(supabase, organizationId, personId) : null,
  ]);

  return { branch, person };
}

async function loadBranch(
  supabase: SupabaseServerClient,
  organizationId: string,
  branchId: string,
): Promise<AccountBranch | null> {
  const { data, error } = await supabase
    .from("organization_branches")
    .select("code, name")
    .eq("organization_id", organizationId)
    .eq("id", branchId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    code: data.code,
    name: data.name,
  };
}

async function loadPerson(
  supabase: SupabaseServerClient,
  organizationId: string,
  personId: string,
): Promise<AccountPerson | null> {
  const [personResult, roleResult] = await Promise.all([
    supabase
      .from("people")
      .select("display_name, legal_name, party_type, primary_email, primary_phone")
      .eq("organization_id", organizationId)
      .eq("id", personId)
      .maybeSingle(),
    supabase
      .from("person_roles")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("person_id", personId)
      .eq("status", "active")
      .is("archived_at", null),
  ]);

  if (personResult.error || !personResult.data) {
    return null;
  }

  return {
    displayName: personResult.data.display_name,
    email: personResult.data.primary_email,
    legalName: personResult.data.legal_name,
    partyType: personResult.data.party_type,
    phone: personResult.data.primary_phone,
    roles: (roleResult.data ?? []).map((row) => row.role),
  };
}

function AccountFact({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {Icon ? <Icon size={12} /> : null}
        {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

function getRoleScope(role: WorkspaceRole, branch: AccountBranch | null) {
  if (role === "admin") {
    return "Full access";
  }

  if (role === "manager") {
    return branch ? `${branch.code} branch` : "All branches";
  }

  return "Assigned tasks";
}

function getRoleTone(role: WorkspaceRole) {
  if (role === "admin") {
    return "danger";
  }

  if (role === "manager") {
    return "warning";
  }

  return "accent";
}

function formatPlatformRole(role: WorkspaceRole) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "manager") {
    return "Manager";
  }

  return "Member";
}

function formatPartyType(value: string) {
  return value === "company" ? "Company" : "Individual";
}

function formatPersonRole(value: string) {
  if (value === "tenant") {
    return "Tenant";
  }

  if (value === "owner") {
    return "Owner";
  }

  if (value === "vendor") {
    return "Vendor";
  }

  return "Staff";
}
