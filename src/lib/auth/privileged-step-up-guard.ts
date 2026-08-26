import "server-only";

import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { privilegedStepUpRequiredMessage } from "@/lib/auth/privileged-step-up-error";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";

export type PrivilegedStepUpRequestClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type PrivilegedStepUpContext = {
  organizationId: string;
  userId: string;
};

const uuid = z.uuid();
export async function requirePrivilegedStepUp(
  expected: PrivilegedStepUpContext,
  requestClient?: PrivilegedStepUpRequestClient,
) {
  if (
    !uuid.safeParse(expected.organizationId).success ||
    !uuid.safeParse(expected.userId).success
  ) {
    throw new Error(privilegedStepUpRequiredMessage);
  }

  const supabase = requestClient ?? (await createSupabaseServerClient());
  let claimsResult;
  let userResult;
  try {
    [claimsResult, userResult] = await Promise.all([
      supabase.auth.getClaims(),
      supabase.auth.getUser(),
    ]);
  } catch {
    throw new Error(privilegedStepUpRequiredMessage);
  }
  const claims = claimsResult.data?.claims as
    | { session_id?: unknown; sub?: unknown }
    | undefined;
  const user = userResult.data.user;
  if (
    claimsResult.error ||
    userResult.error ||
    !user ||
    user.id !== expected.userId ||
    claims?.sub !== expected.userId ||
    typeof claims.session_id !== "string" ||
    !uuid.safeParse(claims.session_id).success
  ) {
    throw new Error(privilegedStepUpRequiredMessage);
  }

  let admin;
  let assertion;
  try {
    admin = createSupabaseAdminClient();
    assertion = await admin.rpc(
      "assert_privileged_email_step_up_satisfied",
      {
        p_organization_id: expected.organizationId,
        p_session_id: claims.session_id,
        p_user_id: expected.userId,
      },
    );
  } catch {
    throw new Error(privilegedStepUpRequiredMessage);
  }
  if (assertion.error) {
    throw new Error(privilegedStepUpRequiredMessage);
  }
  if (assertion.data !== true) {
    let statusUnavailable = false;
    try {
      const status = await admin.rpc("get_privileged_email_step_up_status", {
        p_organization_id: expected.organizationId,
        p_session_id: claims.session_id,
        p_user_id: expected.userId,
      });
      statusUnavailable =
        status.error?.code === "42501" &&
        status.error.message === "Status unavailable";
    } catch {
      // An unavailable discriminator must fail closed as verification-required.
    }
    if (statusUnavailable) {
      redirect("/login", RedirectType.replace);
    }
    throw new Error(privilegedStepUpRequiredMessage);
  }

  return admin;
}
