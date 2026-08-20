import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./sentry-autofix.mjs", import.meta.url));

function runCli(args, environment = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: {
        ...process.env,
        SENTRY_AUTOFIX_API_BASE: "",
        SENTRY_AUTOFIX_TOKEN: "",
        SENTRY_ORG: "",
        SENTRY_PROJECT: "",
        NESTORY_SENTRY_ORG: "",
        NESTORY_SENTRY_PROJECT: "",
        ...environment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

async function withFixtureServer(issue, callback) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ body, method: request.method, url: request.url });
    response.setHeader("content-type", "application/json");

    if (request.url?.includes("/issues/?")) {
      response.end(JSON.stringify([issue]));
      return;
    }
    if (request.url?.includes("/events/latest/")) {
      response.end(
        JSON.stringify({
          entries: [
            {
              data: {
                values: [
                  {
                    stacktrace: {
                      frames: [
                        {
                          filename: "src/components/widget.tsx",
                          function: "Widget",
                          inApp: true,
                        },
                      ],
                    },
                    type: "TypeError",
                    value: issue.exception ?? "Cannot read properties of undefined",
                  },
                ],
              },
              type: "exception",
            },
          ],
          environment: "production",
          release: { version: "a".repeat(40) },
          request: { data: { password: "fixture-secret" } },
          tags: [{ key: "environment", value: "production" }],
          user: { email: "private@example.com" },
        }),
      );
      return;
    }
    if (request.method === "PUT" && request.url?.endsWith(`/issues/${issue.id}/`)) {
      response.end(JSON.stringify({ id: issue.id, status: "resolved" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ detail: "not found" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const environment = {
    SENTRY_AUTOFIX_API_BASE: `http://127.0.0.1:${address.port}`,
    SENTRY_AUTOFIX_TOKEN: "fixture-token",
    SENTRY_ORG: "fixture-org",
    SENTRY_PROJECT: "fixture-project",
  };
  try {
    await callback({ environment, requests });
  } finally {
    server.close();
    await once(server, "close");
  }
}

const issue = {
  count: "3",
  culprit: "Widget (src/components/widget.tsx)",
  firstSeen: "2026-08-20T01:00:00Z",
  id: "101",
  lastSeen: "2026-08-20T02:00:00Z",
  permalink: "https://sentry.example/issues/101",
  shortId: "NESTORY-1",
  title: "TypeError: Cannot read properties of undefined",
  userCount: 2,
};

test("next rejects absent credentials without making a request", async () => {
  const result = await runCli(["next"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /SENTRY_AUTOFIX_TOKEN/);
  assert.doesNotMatch(result.stderr, /Bearer/);
});

test("next emits one redacted low-risk issue", async () => {
  await withFixtureServer(issue, async ({ environment, requests }) => {
    const result = await runCli(["next", "--dry-run"], environment);
    assert.equal(result.code, 0, result.stderr);
    const candidate = JSON.parse(result.stdout);
    assert.equal(candidate.id, "101");
    assert.equal(candidate.disposition, "candidate");
    assert.equal(candidate.environment, "production");
    assert.equal(candidate.frames[0].filename, "src/components/widget.tsx");
    assert.doesNotMatch(result.stdout, /fixture-secret|private@example\.com|fixture-token/);
    assert.equal(requests.length, 2);
    assert.match(
      requests[0].url,
      /^\/api\/0\/projects\/fixture-org\/fixture-project\/issues\/\?/,
    );
    assert.equal(
      requests[1].url,
      "/api/0/organizations/fixture-org/issues/101/events/latest/",
    );
  });
});

test("next prefers the provisioned Nestory project variables", async () => {
  await withFixtureServer(issue, async ({ environment }) => {
    const result = await runCli(["next", "--dry-run"], {
      ...environment,
      NESTORY_SENTRY_ORG: environment.SENTRY_ORG,
      NESTORY_SENTRY_PROJECT: environment.SENTRY_PROJECT,
      SENTRY_ORG: "legacy-org",
      SENTRY_PROJECT: "legacy-project",
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).disposition, "candidate");
  });
});

test("next blocks protected-domain issue text", async () => {
  await withFixtureServer(
    { ...issue, title: "RLS policy rejected rent payment allocation" },
    async ({ environment }) => {
      const result = await runCli(["next", "--dry-run"], environment);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).disposition, "requires_authorization");
    },
  );
});

test("resolve requires both issue id and exact release sha", async () => {
  await withFixtureServer(issue, async ({ environment, requests }) => {
    const result = await runCli(["resolve", "101"], environment);
    assert.equal(result.code, 2);
    assert.equal(requests.length, 0);
  });
});

test("resolve marks one issue resolved in the exact release", async () => {
  await withFixtureServer(issue, async ({ environment, requests }) => {
    const release = "b".repeat(40);
    const result = await runCli(["resolve", "101", "--release", release], environment);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "resolved");
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].body), {
      status: "resolved",
      statusDetails: { inRelease: release },
    });
  });
});
