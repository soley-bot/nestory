"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthActionState } from "@/features/auth/actions";
import { createSupabaseServerClient } from "@/lib/db/server";

const invitationIdSchema = z.uuid();
const invitationPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    passwordConfirm: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: "Passwords do not match.",
    path: ["passwordConfirm"],
  });

type InvitationRow = {
  expires_at: string;
  invitation_id: string;
  invitation_status: string;
  invited_role: string;
  organization_name: string;
  password_required: boolean;
  scope_name: string;
  staff_name: string | null;
};

export type InvitationAcceptance =
  | { state: "signed_out" }
  | { accountEmail: string | null; state: "unavailable" }
  | {
      accountEmail: string | null;
      expiresAt: string;
      invitationId: string;
      organizationName: string;
      passwordRequired: boolean;
      role: string;
      scopeName: string;
      staffName: string | null;
      state: "accepted" | "expired" | "pending" | "revoked" | "send_failed";
    };

export async function getInvitationAcceptance(
  invitationId: string,
): Promise<InvitationAcceptance> {
  if (!invitationIdSchema.safeParse(invitationId).success) {
    return { accountEmail: null, state: "unavailable" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { state: "signed_out" };
  }

  const { data, error } = await supabase.rpc(
    "get_organization_invitation_for_acceptance",
    { p_invitation_id: invitationId },
  );
  const row = (data?.[0] ?? null) as InvitationRow | null;
  if (error || !row) {
    return {
      accountEmail: userData.user.email ?? null,
      state: "unavailable",
    };
  }

  const knownState = ["accepted", "expired", "pending", "revoked", "send_failed"].includes(
    row.invitation_status,
  )
    ? row.invitation_status as "accepted" | "expired" | "pending" | "revoked" | "send_failed"
    : "expired";

  return {
    accountEmail: userData.user.email ?? null,
    expiresAt: row.expires_at,
    invitationId: row.invitation_id,
    organizationName: row.organization_name,
    passwordRequired: row.password_required,
    role: row.invited_role,
    scopeName: row.scope_name,
    staffName: row.staff_name,
    state: knownState,
  };
}

export async function acceptInvitationAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const invitationIdValue = formData.get("invitationId");
  const parsedInvitationId = invitationIdSchema.safeParse(
    typeof invitationIdValue === "string" ? invitationIdValue : "",
  );
  if (!parsedInvitationId.success) {
    return { message: "This invitation is not available.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { message: "Open the invitation email again and sign in.", status: "error" };
  }

  const { data, error: lookupError } = await supabase.rpc(
    "get_organization_invitation_for_acceptance",
    { p_invitation_id: parsedInvitationId.data },
  );
  const invitation = (data?.[0] ?? null) as InvitationRow | null;
  if (lookupError || !invitation || invitation.invitation_status !== "pending") {
    return { message: "This invitation is not available for this account.", status: "error" };
  }

  if (invitation.password_required) {
    const parsedPassword = invitationPasswordSchema.safeParse({
      password: formData.get("password"),
      passwordConfirm: formData.get("passwordConfirm"),
    });
    if (!parsedPassword.success) {
      return {
        fieldErrors: parsedPassword.error.flatten().fieldErrors,
        status: "error",
      };
    }
    const { error: passwordError } = await supabase.auth.updateUser({
      password: parsedPassword.data.password,
    });
    if (passwordError) {
      return {
        message: "The password could not be set. Open a fresh invitation link and try again.",
        status: "error",
      };
    }
  }

  const { error: acceptanceError } = await supabase.rpc(
    "accept_organization_invitation",
    { p_invitation_id: parsedInvitationId.data },
  );
  if (acceptanceError) {
    return {
      message: "The invitation could not be accepted. Ask an administrator to resend it.",
      status: "error",
    };
  }

  redirect("/workspace");
}
