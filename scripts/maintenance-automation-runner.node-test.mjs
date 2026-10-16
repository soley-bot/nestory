import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runMaintenanceAutomation } from "./run-maintenance-automation.mjs";

const RUN_ID = "f04b0655-7b7b-4207-b65b-c603e82eec19";
const OTHER_RUN_ID = "df4cbd55-b54a-4731-90b1-6a280061b942";
const RUN_AT = "2030-01-15T09:00:00+00:00";
const COMPLETED_AT = "2030-01-15T09:00:01+00:00";
const options = {
  baseUrl: "https://example.test", secret: "synthetic-secret-value", runId: RUN_ID,
};

function success(runId = RUN_ID) {
  return {
    run_id: runId, outcome: "succeeded", delivered: 1, generated: 2,
    run_at: RUN_AT, completed_at: COMPLETED_AT,
  };
}

function safeFailure(error, { outcome = "unknown", message } = {}) {
  assert.ok(error instanceof Error);
  assert.equal(error.runId, RUN_ID);
  assert.equal(error.outcome, outcome);
  if (message) assert.equal(error.message, message);
  assert.doesNotMatch(JSON.stringify({ ...error, message: error.message, stack: error.stack }),
    /private-|synthetic-secret-value|secret backend detail/);
  return true;
}

test("local runner invokes the signed route once with a generated UUID and allowlists its result", async () => {
  let authorization;
  let runId;
  let calls = 0;
  const server = createServer((request, response) => {
    calls += 1;
    authorization = request.headers.authorization;
    runId = request.headers["x-maintenance-run-id"];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ...success(runId), private: "synthetic-secret-value" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await runMaintenanceAutomation({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      secret: "synthetic-secret-value",
    });
    assert.deepEqual(result, success(runId));
    assert.match(runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(authorization, "Bearer synthetic-secret-value");
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-value/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("runner normalizes an explicit run ID and accepts a remote HTTPS origin", async () => {
  let requestedUrl;
  let requestedRunId;
  const result = await runMaintenanceAutomation({
    ...options, runId: RUN_ID.toUpperCase(),
    fetchImpl: async (url, request) => {
      requestedUrl = url.href;
      requestedRunId = request.headers["x-maintenance-run-id"];
      return Response.json(success());
    },
  });
  assert.equal(requestedUrl, "https://example.test/api/cron/maintenance");
  assert.equal(requestedRunId, RUN_ID);
  assert.deepEqual(result, success());
});

test("runner rejects invalid run IDs without requesting or reflecting them", async () => {
  for (const runId of ["", "private-invalid-id", `${RUN_ID}-extra`, 1, null]) {
    await assert.rejects(runMaintenanceAutomation({
      ...options, runId,
      fetchImpl: () => assert.fail("must not request"),
    }), (error) => {
      assert.equal(error.message, "Maintenance run ID must be a UUID.");
      assert.equal(error.runId, undefined);
      assert.equal(error.outcome, "unknown");
      return true;
    });
  }
});

test("runner treats HTTP failure without a durable failure envelope as unknown and redacts its body", async () => {
  let calls = 0;
  await assert.rejects(runMaintenanceAutomation({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      return Response.json({ error: "secret backend detail" }, { status: 500 });
    },
  }), (error) => safeFailure(error, {
    message: "Maintenance automation returned an unsuccessful response; outcome is unknown.",
  }));
  assert.equal(calls, 1);
});

test("runner reports an observed failure only for the matching fixed durable failure envelope", async () => {
  await assert.rejects(runMaintenanceAutomation({
    ...options,
    fetchImpl: async () => Response.json({
      run_id: RUN_ID, outcome: "failed", error: "Maintenance automation failed.",
      details: "private-payload synthetic-secret-value",
    }, { status: 500 }),
  }), (error) => safeFailure(error, {
    outcome: "failed", message: "Maintenance automation recorded a failed execution.",
  }));
});

test("runner does not trust malformed, mismatched or incorrectly transported failure claims", async () => {
  for (const [status, body] of [
    [500, { run_id: OTHER_RUN_ID, outcome: "failed", error: "Maintenance automation failed." }],
    [500, { run_id: RUN_ID, outcome: "failed", error: "private-error" }],
    [500, { run_id: RUN_ID, outcome: "unknown", error: "Maintenance automation failed." }],
    [500, { outcome: "failed", error: "Maintenance automation failed." }],
    [503, { run_id: RUN_ID, outcome: "failed", error: "Maintenance automation failed." }],
    [200, { run_id: RUN_ID, outcome: "failed", error: "Maintenance automation failed." }],
  ]) {
    await assert.rejects(runMaintenanceAutomation({
      ...options, fetchImpl: async () => Response.json(body, { status }),
    }), (error) => safeFailure(error));
  }
});

test("runner rejects remote plaintext before sending the bearer secret", async () => {
  await assert.rejects(runMaintenanceAutomation({
    ...options, baseUrl: "http://maintenance.example.com",
    fetchImpl: () => assert.fail("must not request"),
  }), (error) => safeFailure(error, {
    message: "APP_BASE_URL must use HTTPS for non-local hosts.",
  }));
});

test("runner rejects invalid URL protocols, userinfo and non-origin URL components", async () => {
  for (const baseUrl of [
    "private-invalid-url", "file:///private-file",
    "https://user:password@maintenance.example.com",
    "https://maintenance.example.com/path",
    "https://maintenance.example.com?query=value",
    "https://maintenance.example.com/#private-fragment",
  ]) {
    await assert.rejects(runMaintenanceAutomation({
      ...options, baseUrl, fetchImpl: () => assert.fail("must not request"),
    }), (error) => safeFailure(error));
  }
});

test("runner rejects invalid secrets and timeout boundaries before requesting", async () => {
  for (const overrides of [
    { secret: undefined }, { secret: "short" },
    ...[0, -1, 120001, 1.5, NaN].map((timeoutMs) => ({ timeoutMs })),
  ]) {
    await assert.rejects(runMaintenanceAutomation({
      ...options, ...overrides, fetchImpl: () => assert.fail("must not request"),
    }), (error) => safeFailure(error));
  }
});

test("runner sanitizes transport errors, retains the run ID and does not retry", async () => {
  let calls = 0;
  await assert.rejects(runMaintenanceAutomation({
    ...options,
    fetchImpl: async (_url, request) => {
      calls += 1;
      assert.equal(request.redirect, "error");
      assert.equal(request.signal.aborted, false);
      assert.equal(request.headers["x-maintenance-run-id"], RUN_ID);
      throw new Error("synthetic-secret-value private-transport-detail");
    },
  }), (error) => safeFailure(error, {
    message: "Maintenance automation request failed; outcome is unknown.",
  }));
  assert.equal(calls, 1);
});

test("runner leaves the outcome unknown when a response is lost after simulated commit", async () => {
  let committed = false;
  let calls = 0;
  await assert.rejects(runMaintenanceAutomation({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      committed = true;
      throw new Error("private-response-lost-after-commit");
    },
  }), (error) => safeFailure(error));
  assert.equal(committed, true);
  assert.equal(calls, 1);
});

test("runner rejects malformed JSON and invalid success contracts as unknown", async () => {
  for (const body of [
    "private-malformed-body", "null", "[]",
    ...[
      { ...success(), run_id: OTHER_RUN_ID },
      { ...success(), outcome: "registered" },
      { ...success(), generated: -1 },
      { ...success(), delivered: 0.5 },
      { ...success(), generated: 9007199254740992 },
      { ...success(), generated: "1" },
      { ...success(), generated: undefined },
      { ...success(), run_at: "private-timestamp" },
      { ...success(), completed_at: null },
      { ...success(), completed_at: "2030-01-15T08:00:00Z" },
    ].map((value) => JSON.stringify(value)),
  ]) {
    await assert.rejects(runMaintenanceAutomation({
      ...options, fetchImpl: async () => new Response(body),
    }), (error) => safeFailure(error, {
      message: "Maintenance automation returned an invalid result; outcome is unknown.",
    }));
  }
});

test("runner accepts a valid zero-work success", async () => {
  const idle = { ...success(), generated: 0, delivered: 0 };
  assert.deepEqual(await runMaintenanceAutomation({
    ...options, fetchImpl: async () => Response.json(idle),
  }), idle);
});

for (const status of [200, 500]) {
  test(`runner aborts a stalled HTTP ${status} response body without another invocation`, { timeout: 3000 }, async () => {
    let calls = 0;
    const server = createServer((_request, response) => {
      calls += 1;
      response.writeHead(status, { "content-type": "application/json" });
      response.write('{"run_id":');
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      await assert.rejects(runMaintenanceAutomation({
        ...options, baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 100,
      }), (error) => safeFailure(error, {
        message: "Maintenance automation timed out; outcome is unknown.",
      }));
      assert.equal(calls, 1);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}

test("runner rejects redirects without invoking their destination", { timeout: 3000 }, async () => {
  let endpointCalls = 0;
  let destinationCalls = 0;
  const server = createServer((request, response) => {
    if (request.url === "/api/cron/maintenance") {
      endpointCalls += 1;
      response.writeHead(302, { location: "/destination" });
    } else {
      destinationCalls += 1;
      response.writeHead(200);
    }
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(runMaintenanceAutomation({
      ...options, baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 1000,
    }), (error) => safeFailure(error, {
      message: "Maintenance automation request failed; outcome is unknown.",
    }));
    assert.equal(endpointCalls, 1);
    assert.equal(destinationCalls, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("runner aborts before headers without retrying", { timeout: 3000 }, async () => {
  let calls = 0;
  await assert.rejects(runMaintenanceAutomation({
    ...options, timeoutMs: 20,
    fetchImpl: async (_url, { signal }) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("private-timeout-detail")), { once: true });
      });
    },
  }), (error) => safeFailure(error, {
    message: "Maintenance automation timed out; outcome is unknown.",
  }));
  assert.equal(calls, 1);
});

test("CLI keeps the supplied run ID and safe outcome in failure output without requesting", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./run-maintenance-automation.mjs", import.meta.url))], {
    encoding: "utf8",
    env: {
      APP_BASE_URL: "http://example.invalid",
      CRON_SECRET: "synthetic-secret-value",
      MAINTENANCE_RUN_ID: RUN_ID,
    },
    windowsHide: true,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    error: "APP_BASE_URL must use HTTPS for non-local hosts.",
    run_id: RUN_ID,
    outcome: "unknown",
  });
  assert.doesNotMatch(result.stderr, /synthetic-secret-value/);
});
