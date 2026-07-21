import { createClient } from "@supabase/supabase-js";
import {
  parseProvisionArgs,
  provisionWorkspace,
} from "./workspace-provision-core.mjs";

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.NESTORY_APP_URL;

  if (!supabaseUrl || !secretKey || !siteUrl) {
    throw new Error(
      "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), and NESTORY_APP_URL.",
    );
  }

  const client = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const result = await provisionWorkspace({
    client,
    input: parseProvisionArgs(process.argv.slice(2)),
    siteUrl,
  });

  console.log(
    JSON.stringify(
      {
        invitationState: result.invitationState,
        invitedEmail: result.invitedEmail,
        organization: result.organization,
        slug: result.slug,
      },
      null,
      2,
    ),
  );

  if (result.invitationState === "send_failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Workspace provisioning failed.");
  process.exitCode = 1;
});
