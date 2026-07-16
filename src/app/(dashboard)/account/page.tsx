import { PageHeader } from "@/components/layout/page-header";
import {
  AccountScreen,
  type AccountProfile,
} from "@/features/account/components/account-screen";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type AccountBranch = { code: string; name: string };
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
      <PageHeader title="Account" />
      <AccountScreen
        identity={{
          branchLabel: branch ? `${branch.code} - ${branch.name}` : "All branches",
          email: context.userEmail ?? "Email unavailable",
          organizationName: context.organizationName,
          role: context.role,
        }}
        profile={person}
      />
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
  return error || !data ? null : { code: data.code, name: data.name };
}

async function loadPerson(
  supabase: SupabaseServerClient,
  organizationId: string,
  personId: string,
): Promise<AccountProfile | null> {
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

  if (personResult.error || !personResult.data) return null;
  return {
    displayName: personResult.data.display_name,
    email: personResult.data.primary_email,
    legalName: personResult.data.legal_name,
    partyType: personResult.data.party_type,
    phone: personResult.data.primary_phone,
    roles: (roleResult.data ?? []).map((row) => row.role),
  };
}
