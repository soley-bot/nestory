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

  try {
    const admin = createSupabaseAdminClient();
    const runAt = new Date().toISOString();
    const result = await admin.rpc("run_maintenance_automation", {
      p_limit: 100,
      p_run_at: runAt,
    });
    if (!result.error) {
      return Response.json(result.data ?? { delivered: 0, generated: 0 });
    }
  } catch {
    // Setup and transport failures have the same response; never retry an unknown outcome.
  }

  try {
    // Report only a fixed error, without RPC details, credentials or request data.
    captureUnexpectedServerError(
      new Error("Maintenance automation failed."),
      "maintenance_automation",
    );
  } catch {
    // A telemetry failure must not replace the generic response or retry the job.
  }
  return Response.json(
    { error: "Maintenance automation failed." },
    { status: 500 },
  );
}
