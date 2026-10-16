import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const TIMESTAMP_FIELDS = [
  "latest_registered_at", "latest_succeeded_at", "latest_failed_at", "oldest_registered_at",
];
const GAP_FIELDS = [
  "max_registration_gap_ms", "max_success_gap_ms", "max_registered_age_ms",
];
const UNKNOWN_SIGNALS = {
  no_recent_registration: "unknown",
  no_recent_success: "unknown",
  latest_terminal_failed: "unknown",
  unresolved_registration_overdue: "unknown",
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Require an explicit timezone and reject calendar rollover and precision loss.
// PostgreSQL observation timestamps have at most six fractional digits. Keeping
// microseconds as bigint makes the inclusive threshold boundary exact.
function parseTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?([Zz]|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const local = `${match[1]}T${match[2]}`;
  const localMs = Date.parse(`${local}.000Z`);
  if (!Number.isFinite(localMs) || new Date(localMs).toISOString() !== `${local}.000Z`) return null;
  const zone = match[4];
  let offsetMinutes = 0;
  if (zone.toUpperCase() !== "Z") {
    const hours = Number(zone.slice(1, 3));
    const minutes = Number(zone.slice(4, 6));
    if (hours > 23 || minutes > 59) return null;
    offsetMinutes = (hours * 60 + minutes) * (zone[0] === "+" ? 1 : -1);
  }
  const utcMs = localMs - offsetMinutes * 60_000;
  // A four-digit UTC year keeps normalized output bounded and interoperable.
  if (utcMs < -62_167_219_200_000 || utcMs > 253_402_300_799_000) return null;
  return BigInt(utcMs) * 1_000n + BigInt((match[3] ?? "").padEnd(6, "0"));
}

function formatTimestamp(microseconds) {
  const milliseconds = microseconds >= 0n
    ? microseconds / 1_000n
    : (microseconds - 999n) / 1_000n;
  const remainder = microseconds - milliseconds * 1_000n;
  const iso = new Date(Number(milliseconds)).toISOString();
  return remainder === 0n ? iso : iso.replace(/Z$/, `${String(remainder).padStart(3, "0")}Z`);
}

function parsePolicy(policy) {
  if (policy === null || policy === undefined) return { status: "missing" };
  if (!isRecord(policy)) return { status: "invalid" };
  const expectedSince = parseTimestamp(policy.expected_since);
  // Positive safe integers are the implementation range, not an approved SLA.
  // BigInt comparison avoids overflow even at Number.MAX_SAFE_INTEGER ms;
  // no deadline addition or timer conversion can truncate an explicit policy.
  if (expectedSince === null || GAP_FIELDS.some(field =>
    !Object.hasOwn(policy, field) || !Number.isSafeInteger(policy[field]) || policy[field] <= 0)) {
    return { status: "invalid" };
  }
  return { status: "valid", expectedSince, ...Object.fromEntries(
    GAP_FIELDS.map(field => [field, BigInt(policy[field]) * 1_000n]),
  ) };
}

function parseHistory(snapshot) {
  if (snapshot === null || snapshot === undefined) return { status: "unavailable", observedAt: null };
  if (!isRecord(snapshot)) return { status: "invalid", observedAt: null };
  const observedAt = parseTimestamp(snapshot.observed_at);
  const invalid = { status: "invalid", observedAt };
  if (observedAt === null || !Number.isSafeInteger(snapshot.registered_count) || snapshot.registered_count < 0) return invalid;
  const times = {};
  for (const field of TIMESTAMP_FIELDS) {
    if (!Object.hasOwn(snapshot, field)) return invalid;
    times[field] = snapshot[field] === null ? null : parseTimestamp(snapshot[field]);
    if ((snapshot[field] !== null && times[field] === null) ||
      (times[field] !== null && times[field] > observedAt)) return invalid;
  }
  const latestRegistration = times.latest_registered_at;
  const success = times.latest_succeeded_at;
  const failure = times.latest_failed_at;
  const oldest = times.oldest_registered_at;
  const status = snapshot.latest_terminal_status;
  const count = snapshot.registered_count;
  if (![null, "succeeded", "failed"].includes(status)) return invalid;
  if ((count === 0) !== (oldest === null)) return invalid;
  if (oldest !== null && (latestRegistration === null || oldest > latestRegistration)) return invalid;
  if ((status === null) !== (success === null && failure === null)) return invalid;
  if (status === "succeeded" && (success === null || (failure !== null && success < failure))) return invalid;
  if (status === "failed" && (failure === null || (success !== null && failure < success))) return invalid;
  if (latestRegistration === null && (count > 0 || status !== null)) return invalid;
  if (latestRegistration !== null && count === 0) {
    const terminal = status === "succeeded" ? success : failure;
    if (terminal === null || terminal < latestRegistration) return invalid;
  }
  return { status: "valid", observedAt, count, terminalStatus: status, ...times };
}

/**
 * Evaluate a complete, safe aggregate snapshot without a clock, network, retries,
 * scheduler, credentials, side effects, or business-cutoff timestamps.
 *
 * latest_registered_at covers ALL runs; registered_count and oldest_registered_at
 * cover only unresolved registrations. Terminal timestamps are finished_at.
 * Missing/malformed evidence never becomes an empty or successful history.
 * Equality is within policy; a signal triggers only strictly beyond its limit.
 */
export function evaluateMaintenanceRunHealth(snapshot, policy) {
  const history = parseHistory(snapshot);
  const configured = parsePolicy(policy);
  const report = {
    schema_version: 1,
    as_of: history.observedAt === null ? null : formatTimestamp(history.observedAt),
    assessment: "unassessed",
    policy_status: configured.status,
    history_status: history.status,
    expectation_started: null,
    success_observed_since_expectation: null,
    outcome_unknown: history.status === "valid" ? history.count > 0 : null,
    signals: { ...UNKNOWN_SIGNALS },
  };
  if (history.status !== "valid" || configured.status !== "valid") return report;
  report.expectation_started = history.observedAt >= configured.expectedSince;
  if (!report.expectation_started) {
    report.signals = Object.fromEntries(Object.keys(UNKNOWN_SIGNALS).map(key => [key, "not_due"]));
    return report;
  }
  report.success_observed_since_expectation = history.latest_succeeded_at !== null &&
    history.latest_succeeded_at >= configured.expectedSince;
  // A missing or pre-expectation event gets the explicitly configured initial
  // grace period. Old unresolved registrations retain their actual age.
  const gapSignal = (timestamp, threshold) => {
    const since = timestamp !== null && timestamp > configured.expectedSince
      ? timestamp : configured.expectedSince;
    return history.observedAt - since > threshold ? "triggered" : "clear";
  };
  report.signals = {
    no_recent_registration: gapSignal(history.latest_registered_at, configured.max_registration_gap_ms),
    no_recent_success: gapSignal(history.latest_succeeded_at, configured.max_success_gap_ms),
    latest_terminal_failed: history.terminalStatus === "failed" && history.latest_failed_at >= configured.expectedSince
      ? "triggered" : "clear",
    unresolved_registration_overdue: history.count > 0 &&
      history.observedAt - history.oldest_registered_at > configured.max_registered_age_ms
      ? "triggered" : "clear",
  };
  // Grace means not yet overdue; it cannot establish health without a committed
  // success in the expectation window, independently of unresolved outcomes.
  report.assessment = Object.values(report.signals).includes("triggered")
    ? "attention_required"
    : report.outcome_unknown || !report.success_observed_since_expectation ? "unknown" : "clear";
  return report;
}

function localPath(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") &&
    !/^[\\/]{2}/.test(value) && (!value.includes(":") || /^[a-z]:[\\/][^:]*$/i.test(value));
}

/** CLI adapter: read only explicitly named local JSON files; return fixed codes. */
export async function runMaintenanceRunHealthCli(args, { readFileImpl = readFile } = {}) {
  const paths = {};
  const failed = errorCode => ({
    report: evaluateMaintenanceRunHealth(undefined, undefined), exit_code: 2, error_code: errorCode,
  });
  if (!Array.isArray(args) || args.length % 2 !== 0) return failed("invalid_arguments");
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!["--snapshot", "--policy"].includes(flag) || Object.hasOwn(paths, flag) || !localPath(args[index + 1])) {
      return failed("invalid_arguments");
    }
    paths[flag] = args[index + 1];
  }
  if (!paths["--snapshot"]) return failed("invalid_arguments");
  let snapshot;
  let policy;
  for (const flag of ["--snapshot", "--policy"]) {
    if (!paths[flag]) continue;
    let contents;
    try {
      contents = await readFileImpl(paths[flag], "utf8");
    } catch {
      return failed("input_unavailable");
    }
    let parsed;
    try {
      if (typeof contents !== "string" || contents.length > 1_048_576) return failed("invalid_json");
      parsed = JSON.parse(contents);
    } catch {
      return failed("invalid_json");
    }
    if (flag === "--snapshot") snapshot = parsed;
    else policy = parsed;
  }
  const report = evaluateMaintenanceRunHealth(snapshot, policy);
  return {
    report,
    exit_code: report.assessment === "clear" ? 0 : report.assessment === "attention_required" ? 1 : 2,
    error_code: null,
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await runMaintenanceRunHealthCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.report)}\n`);
  if (result.error_code) process.stderr.write("Maintenance health input could not be read or parsed; assessment is unavailable.\n");
  process.exitCode = result.exit_code;
}
