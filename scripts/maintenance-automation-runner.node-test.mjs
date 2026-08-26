import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { runMaintenanceAutomation } from "./run-maintenance-automation.mjs";

test("local runner invokes the signed maintenance route without exposing the secret", async () => {
  let authorization = null;
  const server = createServer((request, response) => {
    authorization = request.headers.authorization;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ delivered: 1, generated: 2 }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    const result = await runMaintenanceAutomation({
      baseUrl: `http://127.0.0.1:${address.port}`,
      secret: "runner-secret-value",
    });

    assert.deepEqual(result, { delivered: 1, generated: 2 });
    assert.equal(authorization, "Bearer runner-secret-value");
    assert.doesNotMatch(JSON.stringify(result), /runner-secret-value/);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("local runner reports a failed route without echoing its response body", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "secret backend detail" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await assert.rejects(
      runMaintenanceAutomation({
        baseUrl: `http://127.0.0.1:${address.port}`,
        secret: "runner-secret-value",
      }),
      (error) =>
        error instanceof Error &&
        error.message === "Maintenance automation returned HTTP 500.",
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("runner rejects remote plaintext before sending the bearer secret", async () => {
  let requested = false;

  await assert.rejects(
    runMaintenanceAutomation({
      baseUrl: "http://maintenance.example.com",
      fetchImpl: async () => {
        requested = true;
        throw new Error("fetch must not run");
      },
      secret: "runner-secret-value",
    }),
    (error) =>
      error instanceof Error
      && error.message === "APP_BASE_URL must use HTTPS for non-local hosts.",
  );
  assert.equal(requested, false);
});

test("runner accepts a remote HTTPS origin", async () => {
  let requestedUrl = null;

  const result = await runMaintenanceAutomation({
    baseUrl: "https://maintenance.example.com",
    fetchImpl: async (url) => {
      requestedUrl = url.href;
      return new Response(JSON.stringify({ delivered: 0, generated: 0 }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    },
    secret: "runner-secret-value",
  });

  assert.equal(
    requestedUrl,
    "https://maintenance.example.com/api/cron/maintenance",
  );
  assert.deepEqual(result, { delivered: 0, generated: 0 });
});

test("runner rejects userinfo and non-origin URL components", async () => {
  for (const baseUrl of [
    "https://user:password@maintenance.example.com",
    "https://maintenance.example.com/path",
    "https://maintenance.example.com?query=value",
  ]) {
    await assert.rejects(
      runMaintenanceAutomation({
        baseUrl,
        secret: "runner-secret-value",
      }),
      /APP_BASE_URL must contain only an origin/,
    );
  }
});
