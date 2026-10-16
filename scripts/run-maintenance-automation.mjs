import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

class MaintenanceAutomationError extends Error {
  constructor(message, runId, outcome = "unknown") {
    super(message);
    this.runId = runId;
    this.outcome = outcome;
  }
}

export async function runMaintenanceAutomation({
  baseUrl,
  secret,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  runId = randomUUID(),
}) {
  if (typeof runId !== "string" || !UUID.test(runId)) {
    throw new MaintenanceAutomationError("Maintenance run ID must be a UUID.");
  }
  const normalizedRunId = runId.toLowerCase();
  const normalizedBaseUrl = requiredBaseUrl(baseUrl, normalizedRunId);
  if (typeof secret !== "string" || secret.length < 16) {
    throw new MaintenanceAutomationError("CRON_SECRET must contain at least 16 characters.", normalizedRunId);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new MaintenanceAutomationError("Maintenance automation timeout must be between 1 and 120000 milliseconds.", normalizedRunId);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(
        new URL("/api/cron/maintenance", normalizedBaseUrl),
        {
          headers: {
            authorization: `Bearer ${secret}`,
            "x-maintenance-run-id": normalizedRunId,
          },
          redirect: "error",
          signal: controller.signal,
        },
      );
    } catch {
      throw new MaintenanceAutomationError(controller.signal.aborted
        ? "Maintenance automation timed out; outcome is unknown."
        : "Maintenance automation request failed; outcome is unknown.", normalizedRunId);
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new MaintenanceAutomationError(controller.signal.aborted
        ? "Maintenance automation timed out; outcome is unknown."
        : "Maintenance automation returned an invalid result; outcome is unknown.", normalizedRunId);
    }
    if (response.status !== 200) {
      const failed = response.status === 500 && isObject(result)
        && result.run_id === normalizedRunId && result.outcome === "failed"
        && result.error === "Maintenance automation failed.";
      throw new MaintenanceAutomationError(failed
        ? "Maintenance automation recorded a failed execution."
        : "Maintenance automation returned an unsuccessful response; outcome is unknown.",
      normalizedRunId, failed ? "failed" : "unknown");
    }
    if (!isObject(result) || result.run_id !== normalizedRunId
      || result.outcome !== "succeeded"
      || !isCounter(result.generated) || !isCounter(result.delivered)
      || !isTimestamp(result.run_at) || !isTimestamp(result.completed_at)
      || Date.parse(result.completed_at) < Date.parse(result.run_at)) {
      throw new MaintenanceAutomationError("Maintenance automation returned an invalid result; outcome is unknown.", normalizedRunId);
    }
    return {
      run_id: normalizedRunId,
      outcome: "succeeded",
      delivered: result.delivered,
      generated: result.generated,
      run_at: result.run_at,
      completed_at: result.completed_at,
    };
  } finally {
    clearTimeout(timer);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  return typeof value === "string" && TIMESTAMP.test(value)
    && Number.isFinite(Date.parse(value));
}

function isCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function requiredBaseUrl(value, runId) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new MaintenanceAutomationError("APP_BASE_URL must be an absolute HTTP(S) URL.", runId);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new MaintenanceAutomationError("APP_BASE_URL must be an absolute HTTP(S) URL.", runId);
  }
  if (
    parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new MaintenanceAutomationError("APP_BASE_URL must contain only an origin.", runId);
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  const isLocalHost = [
    "localhost",
    "127.0.0.1",
    "::1",
    "host.docker.internal",
  ].includes(hostname);
  if (parsed.protocol !== "https:" && !isLocalHost) {
    throw new MaintenanceAutomationError("APP_BASE_URL must use HTTPS for non-local hosts.", runId);
  }

  return new URL(parsed.origin);
}

async function main() {
  const result = await runMaintenanceAutomation({
    baseUrl: process.env.APP_BASE_URL,
    secret: process.env.CRON_SECRET,
    runId: process.env.MAINTENANCE_RUN_ID,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    const result = error instanceof MaintenanceAutomationError
      ? { error: error.message, run_id: error.runId, outcome: error.outcome }
      : { error: "Maintenance automation failed.", outcome: "unknown" };
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  });
}
