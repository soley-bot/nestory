import { createClient } from "@supabase/supabase-js";
import { cleanupPaidCostEvidenceOrphans } from "./cleanup-paid-cost-storage-orphans-core.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const graceArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--grace-hours="));
const graceHours = graceArgument
  ? Number(graceArgument.slice("--grace-hours=".length))
  : 24;
if (!Number.isFinite(graceHours) || graceHours < 1 / 12) {
  throw new Error("--grace-hours must be at least 0.0834 (five minutes).");
}

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
  );
}

const client = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const errors = [];
const result = await cleanupPaidCostEvidenceOrphans({
  apply,
  client,
  graceSeconds: Math.round(graceHours * 60 * 60),
  onError: (error) => errors.push(error),
});

console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    ...result,
    ...(errors.length > 0 ? { errors } : {}),
  }),
);

if (result.failed > 0) {
  process.exitCode = 1;
}
