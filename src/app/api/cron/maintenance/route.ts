import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { captureUnexpectedServerError } from "@/lib/observability/capture-unexpected-server-error";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

type RunSnapshot = {
  run_id: string;
  status: "registered" | "succeeded" | "failed";
  run_at: string;
  registered_at: string;
  finished_at: string | null;
  generated: number | null;
  delivered: number | null;
  failure_code: "maintenance_execution_failed" | null;
};

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

  const suppliedRunId = request.headers.get("x-maintenance-run-id");
  if (suppliedRunId !== null && !UUID.test(suppliedRunId)) {
    return Response.json({ error: "Invalid maintenance run ID." }, { status: 400 });
  }
  const runId = suppliedRunId?.toLowerCase() ?? randomUUID();
  let outcome: "failed" | "unknown" = "unknown";

  try {
    const admin = createSupabaseAdminClient();
    const registration = await admin.rpc("begin_maintenance_automation_run", {
      p_run_id: runId,
      p_limit: 100,
    });
    if (!registration.error && isRegistration(registration.data, runId)) {
      let snapshot: RunSnapshot | null = registration.data;
      if (registration.data.created) {
        // A confirmed new registration permits exactly one execution attempt.
        const execution = await admin.rpc("execute_maintenance_automation_run", {
          p_run_id: runId,
        });
        snapshot = !execution.error && isRunSnapshot(execution.data, runId)
          ? execution.data
          : null;
      }
      if (snapshot?.status === "succeeded") {
        return Response.json({
          run_id: snapshot.run_id,
          outcome: "succeeded",
          generated: snapshot.generated,
          delivered: snapshot.delivered,
          run_at: snapshot.run_at,
          completed_at: snapshot.finished_at,
        });
      }
      if (snapshot?.status === "failed") outcome = "failed";
    }
  } catch {
    // A response can be lost after commit. Never retry or write a failure here.
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
    { error: "Maintenance automation failed.", run_id: runId, outcome },
    { status: 500 },
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value)
    && Number.isFinite(Date.parse(value));
}

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRunSnapshot(value: unknown, runId: string): value is RunSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("run_id" in value) || value.run_id !== runId
    || !("run_at" in value) || !isTimestamp(value.run_at)
    || !("registered_at" in value) || !isTimestamp(value.registered_at)
    || !("status" in value) || !("finished_at" in value)
    || !("generated" in value) || !("delivered" in value)
    || !("failure_code" in value)) return false;

  if (value.status === "registered") {
    return value.finished_at === null && value.generated === null
      && value.delivered === null && value.failure_code === null;
  }
  if (!isTimestamp(value.finished_at)
    || Date.parse(value.finished_at) < Date.parse(value.registered_at)) return false;
  if (value.status === "succeeded") {
    return isCounter(value.generated) && isCounter(value.delivered)
      && value.failure_code === null;
  }
  return value.status === "failed" && value.generated === null
    && value.delivered === null && value.failure_code === "maintenance_execution_failed";
}

function isRegistration(value: unknown, runId: string): value is RunSnapshot & { created: boolean } {
  return isRunSnapshot(value, runId) && "created" in value
    && typeof value.created === "boolean"
    && (!value.created || value.status === "registered");
}
