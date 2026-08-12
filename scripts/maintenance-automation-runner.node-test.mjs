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
