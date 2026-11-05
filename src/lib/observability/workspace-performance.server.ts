import "server-only";

type Workspace = "finance" | "leases" | "overview";
const DEFAULT_PRODUCTION_SAMPLE_RATE = 0.05;
const SLOW_READ_MS = 1_000;

// Keep dimensions fixed: no record identifiers, filters, result payloads,
// request headers, or exception messages belong in performance logs.
export async function measureWorkspaceRead<T>(
  workspace: Workspace,
  read: () => Promise<T>,
): Promise<T> {
  const sampleRate = performanceSampleRate();
  if (sampleRate === 0) return read();

  // Decide before the read so `sampled: true` remains an unbiased population
  // for percentiles, even though slow and failed reads are also retained.
  const sampled = Math.random() < sampleRate;
  const startedAt = performance.now();
  let outcome: "success" | "error" = "success";

  try {
    return await read();
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    if (sampled || outcome === "error" || durationMs >= SLOW_READ_MS) {
      try {
        console.info(JSON.stringify({
          event: "nestory.workspace_read",
          workspace,
          duration_ms: durationMs,
          outcome,
          sampled,
        }));
      } catch {
        // Monitoring must never replace a valid result or the original error.
      }
    }
  }
}

function performanceSampleRate() {
  const fallback = process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_SAMPLE_RATE : 0;
  const configured = process.env.NESTORY_PERFORMANCE_SAMPLE_RATE?.trim();
  if (!configured) return fallback;
  const rate = Number(configured);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : fallback;
}
