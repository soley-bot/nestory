import { createSupabaseAdminClient } from "@/lib/db/admin";

export type PasswordCredentialProofMethod =
  | "invitation_password"
  | "password_login"
  | "password_recovery";

export async function recordPasswordCredentialProof(
  authUserId: string,
  proofMethod: PasswordCredentialProofMethod,
) {
  try {
    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient.rpc(
      "record_auth_password_credential_proof",
      {
        p_auth_user_id: authUserId,
        p_proof_method: proofMethod,
      },
    );
    return !error;
  } catch {
    return false;
  }
}
