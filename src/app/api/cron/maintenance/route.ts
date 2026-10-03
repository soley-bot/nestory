import { createSupabaseAdminClient } from "@/lib/db/admin";
import { captureUnexpectedServerError } from "@/lib/observability/capture-unexpected-server-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "Maintenance automation is not configured." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const runAt = new Date().toISOString();
  const result = await admin.rpc("run_maintenance_automation", {
    p_limit: 100,
    p_run_at: runAt,
  });
  if (result.error) {
    captureUnexpectedServerError(
      new Error("Maintenance automation RPC failed."),
      "maintenance_automation_rpc",
    );
    return Response.json(
      { error: "Maintenance automation failed." },
      { status: 500 },
    );
  }

  return Response.json(result.data ?? { delivered: 0, generated: 0 });
}
