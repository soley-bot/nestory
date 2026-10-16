import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateMaintenanceRunHealth, runMaintenanceRunHealthCli } from "./maintenance-run-health.mjs";

const snapshot = {
  observed_at: "2026-10-16T12:00:00.000Z",
  latest_registered_at: "2026-10-16T11:55:00.000Z",
  latest_succeeded_at: "2026-10-16T11:56:00.000Z",
  latest_failed_at: null,
  latest_terminal_status: "succeeded",
  registered_count: 0,
  oldest_registered_at: null,
};
const policy = {
  expected_since: "2026-10-16T11:00:00.000Z",
  max_registration_gap_ms: 10 * 60_000,
  max_success_gap_ms: 15 * 60_000,
  max_registered_age_ms: 5 * 60_000,
};
const clearSignals = {
  no_recent_registration: "clear",
  no_recent_success: "clear",
  latest_terminal_failed: "clear",
  unresolved_registration_overdue: "clear",
};
const empty = {
  observed_at: snapshot.observed_at,
  latest_registered_at: null,
  latest_succeeded_at: null,
  latest_failed_at: null,
  latest_terminal_status: null,
  registered_count: 0,
  oldest_registered_at: null,
};

function assertUnassessed(report) {
  assert.equal(report.assessment, "unassessed");
  assert.equal(report.expectation_started, null);
  assert.equal(report.success_observed_since_expectation, null);
  assert.ok(Object.values(report.signals).every(value => value === "unknown"));
}

test("a recent successful idle run is clear without requiring generated or delivered work", () => {
  assert.deepEqual(evaluateMaintenanceRunHealth(snapshot, policy), {
    schema_version: 1,
    as_of: "2026-10-16T12:00:00.000Z",
    assessment: "clear",
    policy_status: "valid",
    history_status: "valid",
    expectation_started: true,
    success_observed_since_expectation: true,
    outcome_unknown: false,
    signals: clearSignals,
  });
});

test("recent success does not conceal missing recent registration", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_registered_at: "2026-10-16T11:40:00Z",
  }, policy);
  assert.equal(report.assessment, "attention_required");
  assert.deepEqual(report.signals, { ...clearSignals, no_recent_registration: "triggered" });
});

test("recent registration does not conceal missing recent success", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot,
    latest_registered_at: "2026-10-16T11:59:00Z",
    latest_succeeded_at: "2026-10-16T11:40:00Z",
    registered_count: 1,
    oldest_registered_at: "2026-10-16T11:59:00Z",
  }, policy);
  assert.equal(report.assessment, "attention_required");
  assert.equal(report.outcome_unknown, true);
  assert.deepEqual(report.signals, { ...clearSignals, no_recent_success: "triggered" });
});

test("a fresh unresolved registration has unknown outcome without being overdue", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_registered_at: "2026-10-16T11:59:00Z",
    registered_count: 1, oldest_registered_at: "2026-10-16T11:59:00Z",
  }, policy);
  assert.equal(report.assessment, "unknown");
  assert.equal(report.outcome_unknown, true);
  assert.equal(report.success_observed_since_expectation, true);
  assert.deepEqual(report.signals, clearSignals);
});

test("latest failure and a separate unknown outcome coexist", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_registered_at: "2026-10-16T11:59:00Z",
    latest_failed_at: "2026-10-16T11:58:00Z", latest_terminal_status: "failed",
    registered_count: 1, oldest_registered_at: "2026-10-16T11:59:00Z",
  }, policy);
  assert.equal(report.assessment, "attention_required");
  assert.equal(report.outcome_unknown, true);
  assert.deepEqual(report.signals, { ...clearSignals, latest_terminal_failed: "triggered" });
});

test("a later success cannot hide an older unresolved registration", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, registered_count: 1, oldest_registered_at: "2026-10-16T10:30:00Z",
  }, policy);
  assert.equal(report.assessment, "attention_required");
  assert.equal(report.outcome_unknown, true);
  assert.deepEqual(report.signals, { ...clearSignals, unresolved_registration_overdue: "triggered" });
});

test("separate stale, failed, and overdue signals are all retained", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_registered_at: "2026-10-16T11:30:00Z",
    latest_succeeded_at: "2026-10-16T11:25:00Z",
    latest_failed_at: "2026-10-16T11:35:00Z", latest_terminal_status: "failed",
    registered_count: 2, oldest_registered_at: "2026-10-16T11:20:00Z",
  }, policy);
  assert.equal(report.assessment, "attention_required");
  assert.ok(Object.values(report.signals).every(value => value === "triggered"));
});

test("a known empty history is distinct from an unavailable snapshot", () => {
  const report = evaluateMaintenanceRunHealth(empty, policy);
  assert.equal(report.history_status, "valid");
  assert.equal(report.assessment, "attention_required");
  assert.equal(report.outcome_unknown, false);
  assert.equal(report.success_observed_since_expectation, false);
  assert.deepEqual(report.signals, {
    ...clearSignals, no_recent_registration: "triggered", no_recent_success: "triggered",
  });
  for (const missing of [undefined, null]) {
    const unavailable = evaluateMaintenanceRunHealth(missing, policy);
    assertUnassessed(unavailable);
    assert.equal(unavailable.as_of, null);
    assert.equal(unavailable.history_status, "unavailable");
    assert.equal(unavailable.outcome_unknown, null);
  }
});

test("missing policy never silently applies a default SLA", () => {
  for (const missing of [undefined, null]) {
    const report = evaluateMaintenanceRunHealth(snapshot, missing);
    assertUnassessed(report);
    assert.equal(report.policy_status, "missing");
    assert.equal(report.history_status, "valid");
    assert.equal(report.as_of, snapshot.observed_at);
  }
});

test("unknown unfinished outcome is retained when a policy is missing", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, registered_count: 1, oldest_registered_at: snapshot.latest_registered_at,
  });
  assertUnassessed(report);
  assert.equal(report.outcome_unknown, true);
});

test("before expected_since all timing and failure signals are not due", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_failed_at: "2026-10-16T11:58:00Z", latest_terminal_status: "failed",
    registered_count: 1, oldest_registered_at: "2026-10-16T10:00:00Z",
  }, { ...policy, expected_since: "2026-10-16T13:00:00Z" });
  assert.equal(report.assessment, "unassessed");
  assert.equal(report.expectation_started, false);
  assert.equal(report.success_observed_since_expectation, null);
  assert.equal(report.outcome_unknown, true);
  assert.ok(Object.values(report.signals).every(value => value === "not_due"));
});

test("empty history remains unknown during explicit registration and success grace periods", () => {
  for (const expectedSince of ["2026-10-16T12:00:00Z", "2026-10-16T11:50:00Z"]) {
    const report = evaluateMaintenanceRunHealth(empty, { ...policy, expected_since: expectedSince });
    assert.equal(report.expectation_started, true);
    assert.equal(report.assessment, "unknown");
    assert.equal(report.outcome_unknown, false);
    assert.equal(report.success_observed_since_expectation, false);
    assert.deepEqual(report.signals, clearSignals);
  }
  const afterRegistrationGrace = evaluateMaintenanceRunHealth(empty, {
    ...policy, expected_since: "2026-10-16T11:49:59.999999Z",
  });
  assert.deepEqual(afterRegistrationGrace.signals, { ...clearSignals, no_recent_registration: "triggered" });
  const afterSuccessGrace = evaluateMaintenanceRunHealth(empty, {
    ...policy, expected_since: "2026-10-16T11:44:59.999999Z",
  });
  assert.equal(afterSuccessGrace.signals.no_recent_success, "triggered");
});

test("pre-expectation failure is historical and pre-expectation events receive initial grace", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_registered_at: "2026-10-16T10:58:00Z",
    latest_succeeded_at: null, latest_failed_at: "2026-10-16T10:59:00Z",
    latest_terminal_status: "failed",
  }, { ...policy, expected_since: "2026-10-16T11:59:00Z" });
  assert.equal(report.assessment, "unknown");
  assert.equal(report.outcome_unknown, false);
  assert.equal(report.success_observed_since_expectation, false);
  assert.deepEqual(report.signals, clearSignals);
});

test("a pre-expectation success does not establish health during initial grace", () => {
  const report = evaluateMaintenanceRunHealth(snapshot, {
    ...policy, expected_since: "2026-10-16T11:59:00Z",
  });
  assert.equal(report.assessment, "unknown");
  assert.equal(report.outcome_unknown, false);
  assert.equal(report.success_observed_since_expectation, false);
  assert.deepEqual(report.signals, clearSignals);
});

test("a fresh committed success at or after expectation establishes clear health", () => {
  for (const finishedAt of ["2026-10-16T11:59:00Z", "2026-10-16T11:59:00.000001Z"]) {
    const report = evaluateMaintenanceRunHealth({
      ...snapshot, latest_succeeded_at: finishedAt,
    }, { ...policy, expected_since: "2026-10-16T11:59:00Z" });
    assert.equal(report.assessment, "clear");
    assert.equal(report.outcome_unknown, false);
    assert.equal(report.success_observed_since_expectation, true);
    assert.deepEqual(report.signals, clearSignals);
  }
});

test("an in-window failure still requires attention without a committed success", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_succeeded_at: null,
    latest_failed_at: "2026-10-16T11:59:00Z", latest_terminal_status: "failed",
  }, { ...policy, expected_since: "2026-10-16T11:59:00Z" });
  assert.equal(report.assessment, "attention_required");
  assert.equal(report.outcome_unknown, false);
  assert.equal(report.success_observed_since_expectation, false);
  assert.deepEqual(report.signals, { ...clearSignals, latest_terminal_failed: "triggered" });
});

test("failure exactly at expected_since is in scope", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_failed_at: "2026-10-16T11:59:00Z", latest_terminal_status: "failed",
  }, { ...policy, expected_since: "2026-10-16T11:59:00Z" });
  assert.equal(report.signals.latest_terminal_failed, "triggered");
});

test("old unresolved work retains its actual age when expectation begins", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, registered_count: 1, oldest_registered_at: "2026-10-16T10:30:00Z",
  }, { ...policy, expected_since: snapshot.observed_at });
  assert.equal(report.signals.unresolved_registration_overdue, "triggered");
});

test("registration and success ages at the exact threshold are clear", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, latest_registered_at: "2026-10-16T11:50:00Z",
    latest_succeeded_at: "2026-10-16T11:45:00Z",
    registered_count: 1, oldest_registered_at: "2026-10-16T11:50:00Z",
  }, { ...policy, max_registered_age_ms: 10 * 60_000 });
  assert.equal(report.history_status, "valid");
  assert.deepEqual(report.signals, clearSignals);
});

test("one microsecond beyond each exact threshold triggers only its respective signal", () => {
  const boundarySnapshot = {
    ...snapshot, latest_registered_at: "2026-10-16T11:50:00Z",
    latest_succeeded_at: "2026-10-16T11:45:00Z",
    registered_count: 1, oldest_registered_at: "2026-10-16T11:50:00Z",
  };
  const boundaryPolicy = { ...policy, max_registered_age_ms: 10 * 60_000 };
  const cases = [
    [{ latest_registered_at: "2026-10-16T11:49:59.999999Z", oldest_registered_at: "2026-10-16T11:49:59.999999Z" },
      { max_registered_age_ms: 11 * 60_000 }, "no_recent_registration"],
    [{ latest_succeeded_at: "2026-10-16T11:44:59.999999Z" }, {}, "no_recent_success"],
    [{ oldest_registered_at: "2026-10-16T11:49:59.999999Z" }, {}, "unresolved_registration_overdue"],
  ];
  for (const [overrides, policyOverrides, triggered] of cases) {
    const report = evaluateMaintenanceRunHealth({ ...boundarySnapshot, ...overrides }, { ...boundaryPolicy, ...policyOverrides });
    assert.deepEqual(report.signals, { ...clearSignals, [triggered]: "triggered" });
  }
});

test("timestamps may equal the observation including microsecond precision", () => {
  const report = evaluateMaintenanceRunHealth({
    ...empty, observed_at: "2026-10-16T12:00:00.123456Z",
    latest_registered_at: "2026-10-16T12:00:00.123456Z",
    registered_count: 1, oldest_registered_at: "2026-10-16T12:00:00.123456Z",
  }, { ...policy, expected_since: "2026-10-16T12:00:00.123456Z" });
  assert.equal(report.as_of, "2026-10-16T12:00:00.123456Z");
  assert.equal(report.assessment, "unknown");
  assert.deepEqual(report.signals, clearSignals);
});

test("timezone offsets normalize to UTC without losing microseconds", () => {
  const report = evaluateMaintenanceRunHealth({
    ...snapshot, observed_at: "2026-10-16T14:30:00.123456+02:30",
    latest_succeeded_at: "2026-10-16T06:56:00-05:00",
  }, policy);
  assert.equal(report.assessment, "clear");
  assert.equal(report.as_of, "2026-10-16T12:00:00.123456Z");
});

test("pre-epoch timestamps retain correct fractional normalization", () => {
  const report = evaluateMaintenanceRunHealth({ ...empty, observed_at: "1969-12-31T23:59:59.999999Z" }, {
    ...policy, expected_since: "1969-12-31T23:59:59Z",
  });
  assert.equal(report.as_of, "1969-12-31T23:59:59.999999Z");
  assert.equal(report.assessment, "unknown");
});

test("malformed, ambiguous and calendar rollover timestamps are unassessed", () => {
  const invalidTimes = ["", "private detail", "2026-10-16", "2026-10-16T12:00:00",
    "2026-02-30T12:00:00Z", "2026-02-29T12:00:00Z", "2026-10-16T24:00:00Z",
    "2026-10-16T12:00:60Z", "2026-10-16T12:00:00.1234567Z", "2026-10-16T12:00:00+24:00",
    "2026-10-16T12:00:00+01:60", " 2026-10-16T12:00:00Z", "2026-10-16T12:00:00Z ",
    "+010000-01-01T00:00:00Z", "0000-01-01T00:00:00+00:01", "9999-12-31T23:59:59-00:01",
    0, Number.NaN, Number.POSITIVE_INFINITY, {}, [], undefined];
  for (const value of invalidTimes) {
    for (const field of ["observed_at", "latest_registered_at", "latest_succeeded_at", "latest_failed_at", "oldest_registered_at"]) {
      const report = evaluateMaintenanceRunHealth({ ...snapshot, [field]: value }, policy);
      assertUnassessed(report);
      assert.equal(report.history_status, "invalid");
      assert.equal(report.outcome_unknown, null);
    }
    const report = evaluateMaintenanceRunHealth(snapshot, { ...policy, expected_since: value });
    assertUnassessed(report);
    assert.equal(report.policy_status, "invalid");
  }
});

test("every history timestamp after observed_at fails closed, even by one microsecond", () => {
  for (const field of ["latest_registered_at", "latest_succeeded_at", "latest_failed_at", "oldest_registered_at"]) {
    const report = evaluateMaintenanceRunHealth({ ...snapshot, [field]: "2026-10-16T12:00:00.000001Z" }, policy);
    assertUnassessed(report);
    assert.equal(report.history_status, "invalid");
  }
});

test("valid leap days and explicit zero offsets are accepted", () => {
  const report = evaluateMaintenanceRunHealth({ ...empty, observed_at: "2024-02-29t12:00:00-00:00" }, {
    ...policy, expected_since: "2024-02-29T12:00:00+00:00",
  });
  assert.equal(report.assessment, "unknown");
  assert.equal(report.as_of, "2024-02-29T12:00:00.000Z");
});

test("all policy gaps must be explicit positive safe-integer milliseconds", () => {
  for (const field of ["max_registration_gap_ms", "max_success_gap_ms", "max_registered_age_ms"]) {
    for (const value of [undefined, null, 0, -1, 0.5, "1000", Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const report = evaluateMaintenanceRunHealth(snapshot, { ...policy, [field]: value });
      assertUnassessed(report);
      assert.equal(report.policy_status, "invalid");
    }
    const without = { ...policy };
    delete without[field];
    assertUnassessed(evaluateMaintenanceRunHealth(snapshot, without));
  }
  for (const invalid of [[], "private policy", false, 0, {}]) {
    assert.equal(evaluateMaintenanceRunHealth(snapshot, invalid).policy_status, "invalid");
  }
});

test("the safe-integer threshold range does not overflow or impose a default cadence", () => {
  const report = evaluateMaintenanceRunHealth(empty, {
    expected_since: "0000-01-01T00:00:00Z",
    max_registration_gap_ms: Number.MAX_SAFE_INTEGER,
    max_success_gap_ms: Number.MAX_SAFE_INTEGER,
    max_registered_age_ms: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(report.assessment, "unknown");
  assert.deepEqual(report.signals, clearSignals);
  const minimum = evaluateMaintenanceRunHealth({ ...empty, observed_at: "2026-10-16T12:00:00.001Z" }, {
    expected_since: "2026-10-16T12:00:00Z",
    max_registration_gap_ms: 1, max_success_gap_ms: 1, max_registered_age_ms: 1,
  });
  assert.equal(minimum.assessment, "unknown");
});

test("counts must be nonnegative safe integers and required history fields cannot be omitted", () => {
  for (const value of [undefined, null, -1, 1.5, "0", Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assertUnassessed(evaluateMaintenanceRunHealth({ ...snapshot, registered_count: value }, policy));
  }
  for (const field of Object.keys(snapshot)) {
    const without = { ...snapshot };
    delete without[field];
    assertUnassessed(evaluateMaintenanceRunHealth(without, policy));
  }
  for (const invalid of [[], 0, "private history", false, {}]) {
    assert.equal(evaluateMaintenanceRunHealth(invalid, policy).history_status, "invalid");
  }
});

test("inconsistent history fails closed", () => {
  const cases = [
    { registered_count: 1 },
    { oldest_registered_at: "2026-10-16T11:54:00Z" },
    { registered_count: 1, oldest_registered_at: "2026-10-16T11:57:00Z" },
    { latest_terminal_status: "registered" },
    { latest_terminal_status: "private status" },
    { latest_terminal_status: null },
    { latest_terminal_status: "failed" },
    { latest_failed_at: "2026-10-16T11:57:00Z" },
    { latest_terminal_status: "failed", latest_failed_at: "2026-10-16T11:54:00Z" },
    { latest_registered_at: null },
    { latest_succeeded_at: null, latest_terminal_status: null },
    { latest_registered_at: "2026-10-16T11:57:00Z" },
  ];
  for (const overrides of cases) {
    const report = evaluateMaintenanceRunHealth({ ...snapshot, ...overrides }, policy);
    assertUnassessed(report);
    assert.equal(report.history_status, "invalid");
  }
});

test("terminal timestamp ties use the supplied deterministic terminal status", () => {
  for (const status of ["succeeded", "failed"]) {
    const report = evaluateMaintenanceRunHealth({
      ...snapshot, latest_failed_at: snapshot.latest_succeeded_at, latest_terminal_status: status,
    }, policy);
    assert.equal(report.history_status, "valid");
    assert.equal(report.signals.latest_terminal_failed, status === "failed" ? "triggered" : "clear");
  }
});

test("valid multiple unresolved registrations and the maximum safe count remain unknown", () => {
  for (const count of [2, Number.MAX_SAFE_INTEGER]) {
    const report = evaluateMaintenanceRunHealth({
      ...snapshot, registered_count: count, oldest_registered_at: snapshot.latest_registered_at,
    }, policy);
    assert.equal(report.assessment, "unknown");
    assert.equal(report.signals.unresolved_registration_overdue, "clear");
  }
});

test("evaluation is deterministic, does not mutate inputs, and emits only fixed safe fields", () => {
  const extraSnapshot = Object.freeze({ ...snapshot, request_id: "private-request", error: "private-error", secret: "private-secret" });
  const extraPolicy = Object.freeze({ ...policy, secret: "private-policy", destination: "private-destination" });
  const first = evaluateMaintenanceRunHealth(extraSnapshot, extraPolicy);
  assert.deepEqual(first, evaluateMaintenanceRunHealth(extraSnapshot, extraPolicy));
  assert.deepEqual(first, evaluateMaintenanceRunHealth(snapshot, policy));
  assert.doesNotMatch(JSON.stringify(first), /private/);
  const invalid = evaluateMaintenanceRunHealth({ ...snapshot, observed_at: "private-invalid" }, extraPolicy);
  assert.doesNotMatch(JSON.stringify(invalid), /private/);
});

test("business cutoff and host clock do not participate in observation age", () => {
  const observed = { ...snapshot, p_as_of: "1900-01-01T00:00:00Z", business_cutoff: "9999-01-01T00:00:00Z" };
  assert.deepEqual(evaluateMaintenanceRunHealth(observed, policy), evaluateMaintenanceRunHealth(snapshot, policy));
});

test("CLI reads only named local JSON paths and distinguishes clear, attention and unknown exit codes", async () => {
  const calls = [];
  const readFileImpl = async (path, encoding) => {
    calls.push([path, encoding]);
    return JSON.stringify(path === "snapshot.json" ? snapshot : policy);
  };
  const result = await runMaintenanceRunHealthCli(["--snapshot", "snapshot.json", "--policy", "policy.json"], { readFileImpl });
  assert.deepEqual(calls, [["snapshot.json", "utf8"], ["policy.json", "utf8"]]);
  assert.equal(result.exit_code, 0);
  assert.equal(result.error_code, null);
  const stale = await runMaintenanceRunHealthCli(["--snapshot", "snapshot.json", "--policy", "policy.json"], {
    readFileImpl: async path => JSON.stringify(path === "snapshot.json" ? empty : policy),
  });
  assert.equal(stale.exit_code, 1);
  const missingPolicy = await runMaintenanceRunHealthCli(["--snapshot", "snapshot.json"], { readFileImpl });
  assert.equal(missingPolicy.exit_code, 2);
  assert.equal(missingPolicy.report.policy_status, "missing");
});

test("CLI rejects unknown, duplicate, missing, remote and credential-bearing arguments without reading", async () => {
  const cases = [[], ["--snapshot"], ["--secret", "private"], ["--policy", "policy.json"],
    ["--snapshot", "a", "--snapshot", "b"], ["--snapshot", "a", "--policy", "b", "--policy", "c"],
    ["--snapshot", "https://private.example/snapshot.json"], ["--snapshot", "//private/snapshot.json"],
    ["--snapshot", "\\\\private\\snapshot.json"], ["--snapshot", "file:///private/snapshot.json"],
    ["--snapshot", "a\0private"], ["--snapshot", ""], ["--snapshot", "C:private.json"]];
  for (const args of cases) {
    const result = await runMaintenanceRunHealthCli(args, { readFileImpl: async () => assert.fail("must not read") });
    assert.equal(result.exit_code, 2);
    assert.equal(result.error_code, "invalid_arguments");
    assertUnassessed(result.report);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test("CLI returns unknown during grace until an in-window success is committed", async () => {
  const gracePolicy = { ...policy, expected_since: "2026-10-16T11:59:00Z" };
  const historicalFailure = {
    ...snapshot, latest_succeeded_at: null, latest_failed_at: "2026-10-16T11:58:00Z",
    latest_terminal_status: "failed",
  };
  const freshSuccess = { ...snapshot, latest_succeeded_at: "2026-10-16T11:59:00Z" };
  for (const [history, expectedExit] of [[empty, 2], [historicalFailure, 2], [snapshot, 2], [freshSuccess, 0]]) {
    const result = await runMaintenanceRunHealthCli(["--snapshot", "snapshot.json", "--policy", "policy.json"], {
      readFileImpl: async path => JSON.stringify(path === "snapshot.json" ? history : gracePolicy),
    });
    assert.equal(result.exit_code, expectedExit);
    assert.equal(result.report.assessment, expectedExit === 0 ? "clear" : "unknown");
    assert.equal(result.report.outcome_unknown, false);
    assert.equal(result.report.success_observed_since_expectation, expectedExit === 0);
    assert.deepEqual(result.report.signals, clearSignals);
  }
});

test("CLI sanitizes read/parse failures and never copies input bodies or paths into output", async () => {
  const args = ["--snapshot", "private-snapshot.json", "--policy", "private-policy.json"];
  for (const readFileImpl of [
    async () => { throw new Error("private path and credential details"); },
    async () => "private malformed JSON",
    async () => "x".repeat(1_048_577),
    async () => null,
  ]) {
    const result = await runMaintenanceRunHealthCli(args, { readFileImpl });
    assert.equal(result.exit_code, 2);
    assertUnassessed(result.report);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test("CLI accepts local absolute paths and returns fresh unknown outcome as exit 2", async () => {
  const pending = { ...snapshot, registered_count: 1, oldest_registered_at: snapshot.latest_registered_at };
  const result = await runMaintenanceRunHealthCli(["--policy", "C:\\local\\policy.json", "--snapshot", "D:/local/snapshot.json"], {
    readFileImpl: async path => JSON.stringify(path.includes("snapshot") ? pending : policy),
  });
  assert.equal(result.error_code, null);
  assert.equal(result.exit_code, 2);
  assert.equal(result.report.assessment, "unknown");
});

test("the executable prints one sanitized JSON report even for invalid arguments", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./maintenance-run-health.mjs", import.meta.url)), "--private-secret"], {
    encoding: "utf8", timeout: 5_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assertUnassessed(JSON.parse(result.stdout));
  assert.equal(result.stdout.trim().split("\n").length, 1);
  assert.equal(result.stderr, "Maintenance health input could not be read or parsed; assessment is unavailable.\n");
  assert.doesNotMatch(result.stdout + result.stderr, /private-secret/);
});
