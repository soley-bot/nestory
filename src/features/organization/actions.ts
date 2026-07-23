"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";

export type OrganizationActionState = {
  message?: string;
  status?: "error" | "success";
};

const uuidShapeSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const optionalUuidSchema = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(uuidShapeSchema.nullable());

const branchSchema = z.object({
  address: z.string().trim().max(240),
  code: z.string().trim().min(2).max(16),
  name: z.string().trim().min(2).max(120),
});

const teamSchema = z.object({
  branchId: optionalUuidSchema,
  managerPersonId: optionalUuidSchema,
  name: z.string().trim().min(2).max(120),
});

const memberSchema = z.object({
  branchId: optionalUuidSchema,
  memberId: uuidShapeSchema,
  personId: optionalUuidSchema,
  role: z.enum(["admin", "manager", "member"]),
});

const userAccessSchema = z.object({
  branchId: optionalUuidSchema,
  email: z.string().trim().toLowerCase().pipe(z.email()),
  personId: uuidShapeSchema,
  role: z.enum(["admin", "manager", "member"]),
});
const invitationIdSchema = z.object({ invitationId: uuidShapeSchema });
const memberIdSchema = z.object({ memberId: uuidShapeSchema });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function createBranchAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = branchSchema.safeParse({
    address: readString(formData, "address"),
    code: readString(formData, "code"),
    name: readString(formData, "name"),
  });

  if (!parsed.success) {
    return { message: "Enter a branch name and code.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_organization_branch", {
    p_address: parsed.data.address || null,
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return { message: "Branch added.", status: "success" };
}

export async function createTeamAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = teamSchema.safeParse({
    branchId: readString(formData, "branchId"),
    managerPersonId: readString(formData, "managerPersonId"),
    name: readString(formData, "name"),
  });

  if (!parsed.success) {
    return { message: "Enter a team name.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_organization_team", {
    p_branch_id: parsed.data.branchId,
    p_manager_person_id: parsed.data.managerPersonId,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return { message: "Team added.", status: "success" };
}

export async function updateMemberAccessAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = memberSchema.safeParse({
    branchId: readString(formData, "branchId"),
    memberId: readString(formData, "memberId"),
    personId: readString(formData, "personId"),
    role: readString(formData, "role"),
  });

  if (!parsed.success) {
    return { message: "Choose a valid role and membership.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_organization_member_access", {
    p_branch_id: parsed.data.branchId,
    p_member_id: parsed.data.memberId,
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
    p_role: parsed.data.role,
  });

  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings(parsed.data.personId);
  return { message: "Access updated.", status: "success" };
}

export async function inviteOrganizationUserAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = userAccessSchema.safeParse({
    branchId: readString(formData, "branchId"),
    email: readString(formData, "email"),
    personId: readString(formData, "personId"),
    role: readString(formData, "role"),
  });

  if (!parsed.success) {
    return {
      message: "Choose a valid Staff member, invitation email, and access level.",
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const createResult = await supabase.rpc("create_organization_invitation", {
    p_branch_id: parsed.data.branchId,
    p_email: parsed.data.email,
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
    p_role: parsed.data.role,
  });

  if (createResult.error || !createResult.data) {
    return {
      message: organizationErrorMessage(createResult.error?.message ?? "Invitation was not created"),
      status: "error",
    };
  }

  const delivery = await deliverInvitation(parsed.data.email, createResult.data);
  const finalizeResult = delivery.error
    ? await supabase.rpc("mark_organization_invitation_delivery_failed", {
        p_error: delivery.error,
        p_invitation_id: createResult.data,
      })
    : await supabase.rpc("mark_organization_invitation_sent", {
        p_auth_user_id: delivery.authUserId,
        p_delivery_method: delivery.method,
        p_invitation_id: createResult.data,
      });

  revalidateSettings(parsed.data.personId);
  if (finalizeResult.error) {
    return { message: "Invitation state could not be finalized.", status: "error" };
  }

  return delivery.error
    ? {
        message: "Invitation saved, but email delivery failed. Retry from Pending invitations.",
        status: "error",
      }
    : {
        message: `Invitation sent to ${parsed.data.email} for the selected Staff record.`,
        status: "success",
      };
}

export async function resendOrganizationInvitationAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  await requireAdminContext();
  const parsed = invitationIdSchema.safeParse({
    invitationId: readString(formData, "invitationId"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid invitation.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const refreshResult = await supabase.rpc("refresh_organization_invitation", {
    p_invitation_id: parsed.data.invitationId,
  });
  const invitation = refreshResult.data?.[0];
  if (refreshResult.error || !invitation) {
    return {
      message: refreshResult.error
        ? organizationErrorMessage(refreshResult.error.message)
        : "Invitation could not be refreshed.",
      status: "error",
    };
  }
  const delivery = await deliverInvitation(invitation.email, invitation.invitation_id);
  const finalizeResult = delivery.error
    ? await supabase.rpc("mark_organization_invitation_delivery_failed", {
        p_error: delivery.error,
        p_invitation_id: invitation.invitation_id,
      })
    : await supabase.rpc("mark_organization_invitation_sent", {
        p_auth_user_id: delivery.authUserId,
        p_delivery_method: delivery.method,
        p_invitation_id: invitation.invitation_id,
      });

  revalidateSettings();
  if (finalizeResult.error || delivery.error) {
    return { message: "Invitation email could not be resent.", status: "error" };
  }

  return { message: "Invitation resent.", status: "success" };
}

export async function revokeOrganizationInvitationAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  await requireAdminContext();
  const parsed = invitationIdSchema.safeParse({
    invitationId: readString(formData, "invitationId"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid invitation.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_organization_invitation", {
    p_invitation_id: parsed.data.invitationId,
  });
  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return { message: "Invitation revoked.", status: "success" };
}

export async function removeMemberAccessAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = memberIdSchema.safeParse({
    memberId: readString(formData, "memberId"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid membership.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_organization_member_access", {
    p_member_id: parsed.data.memberId,
    p_organization_id: context.organizationId,
  });
  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return { message: "Access removed.", status: "success" };
}

function revalidateSettings(personId?: string | null) {
  revalidatePath("/settings");
  revalidatePath("/users-roles");
  revalidatePath("/staff");
  revalidatePath("/people");
  revalidatePath("/people/[personId]", "page");
  revalidatePath("/maintenance");
  revalidatePath("/tasks");
  if (personId) revalidatePath(`/people/${personId}`);
}

function organizationErrorMessage(message: string) {
  if (message.includes("This staff member already has workspace access")) {
    return "This Staff member already has workspace access. Review the existing member.";
  }

  if (message.includes("This staff member already has an active invitation")) {
    return "This Staff member already has an active invitation. Review the existing invitation.";
  }

  if (message.includes("An active invitation already exists for this email")) {
    return "That invitation email already has an active invitation.";
  }

  if (message.includes("final administrator")) {
    return message;
  }

  if (message.includes("duplicate key")) {
    return "That code or team name is already in use.";
  }

  if (message.includes("Branch not found")) {
    return "Choose an active branch.";
  }

  if (message.includes("Manager person not found")) {
    return "Choose an active person.";
  }

  if (message.includes("Person not found")) {
    return "Choose an active Staff member.";
  }

  return "We could not save the organization setting.";
}

async function deliverInvitation(email: string, invitationId: string) {
  try {
    const adminClient = createSupabaseAdminClient();
    const redirectTo = await getInvitationConfirmUrl(invitationId);
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo },
    );

    if (!error) {
      return { authUserId: data.user?.id ?? null, error: null, method: "invite" };
    }

    if (isExistingAuthUserError(error)) {
      const claimResult = await adminClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });
      return {
        authUserId: null,
        error: claimResult.error?.message ?? null,
        method: "magic_link",
      };
    }

    return { authUserId: null, error: error.message, method: "invite" };
  } catch (error) {
    return {
      authUserId: null,
      error: error instanceof Error ? error.message : "Invite delivery failed",
      method: "invite",
    };
  }
}

function isExistingAuthUserError(error: { code?: string; message: string }) {
  if (error.code) {
    return error.code === "user_already_exists";
  }

  const normalized = error.message.toLowerCase();

  return (
    normalized.includes("already") ||
    normalized.includes("registered") ||
    normalized.includes("exists")
  );
}

async function getInvitationConfirmUrl(invitationId: string) {
  return getAuthCallbackUrl(
    "/auth/confirm",
    `/accept-invite?invitation=${invitationId}`,
  );
}
