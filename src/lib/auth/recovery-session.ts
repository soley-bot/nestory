import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/db/server";
import { RECOVERY_MARKER_COOKIE, verifyRecoveryMarker } from "@/lib/auth/recovery-marker";

export async function getPasswordRecoveryUser(
  client?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  try {
    const supabase = client ?? (await createSupabaseServerClient());
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const cookieStore = await cookies();
    return verifyRecoveryMarker(
      cookieStore.get(RECOVERY_MARKER_COOKIE)?.value,
      data.user.id,
    ) ? data.user : null;
  } catch {
    return null;
  }
}
