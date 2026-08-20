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
        NODE_ENV: "test",
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

async function withFixtureServer(issueOrIssues, callback) {
  const issues = Array.isArray(issueOrIssues) ? issueOrIssues : [issueOrIssues];
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ body, method: request.method, url: request.url });
    response.setHeader("content-type", "application/json");

    if (request.url?.includes("/issues/?")) {
      response.end(JSON.stringify(issues));
      return;
    }
    if (request.url?.includes("/events/latest/")) {
      const eventIssue =
        issues.find((candidate) => request.url?.includes(`/issues/${candidate.id}/`)) ??
        issues[0];
      response.end(
        JSON.stringify({
          entries: eventIssue.noException ? [] : [
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
                    value:
                      eventIssue.exception ?? "Cannot read properties of undefined",
                  },
                ],
              },
              type: "exception",
            },
          ],
          environment: eventIssue.environment ?? "production",
          release: { version: "a".repeat(40) },
          request: { data: { password: "fixture-secret" } },
          tags: [{ key: "environment", value: "production" }],
          user: { email: "private@example.com" },
        }),
      );
      return;
    }
    const matchedIssue = issues.find((candidate) =>
      request.url?.endsWith(`/issues/${candidate.id}/`),
    );
    if (request.method === "GET" && matchedIssue) {
      response.end(
        JSON.stringify({
          ...matchedIssue,
          project: matchedIssue.project ?? { slug: "fixture-project" },
          status: matchedIssue.status ?? "unresolved",
        }),
      );
      return;
    }
    if (request.method === "PUT" && matchedIssue) {
      response.end(JSON.stringify({ id: matchedIssue.id, status: "resolved" }));
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
    NESTORY_SENTRY_ORG: "fixture-org",
    NESTORY_SENTRY_PROJECT: "fixture-project",
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
  permalink: "https://sentry.io/organizations/fixture-org/issues/101?source=email#event",
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
    assert.equal(candidate.frames[0].filename, "src/components/widget.tsx");
    assert.equal(
      candidate.permalink,
      "https://sentry.io/organizations/fixture-org/issues/101",
    );
    for (const field of ["culprit", "environment", "release", "title"]) {
      assert.equal(Object.hasOwn(candidate, field), false);
    }
    assert.doesNotMatch(result.stdout, /fixture-secret|private@example\.com|fixture-token/);
    assert.equal(requests.length, 2);
    assert.match(
      requests[0].url,
      /^\/api\/0\/projects\/fixture-org\/fixture-project\/issues\/\?/,
    );
    assert.equal(
      requests[1].url,
      "/api/0/organizations/fixture-org/issues/101/events/latest/?environment=production",
    );
  });
});

test("next ignores an issue whose latest event is not production", async () => {
  await withFixtureServer(
    { ...issue, environment: "preview" },
    async ({ environment }) => {
      const result = await runCli(["next", "--dry-run"], environment);
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { disposition: "no_candidate" });
    },
  );
});

test("next ignores an issue without usable exception context", async () => {
  await withFixtureServer(
    { ...issue, noException: true },
    async ({ environment }) => {
      const result = await runCli(["next", "--dry-run"], environment);
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { disposition: "no_candidate" });
    },
  );
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
  for (const title of [
    "RLS policy rejected rent payment allocation",
    "ownerBalances failed in src/features/finance/property-cash.ts",
    "Reports could not format an invoice amount",
    "AccessSettingsPage failed in src/app/(dashboard)/settings/access/page.tsx",
  ]) {
    await withFixtureServer({ ...issue, title }, async ({ environment }) => {
      const result = await runCli(["next", "--dry-run"], environment);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).disposition, "requires_authorization");
    });
  }
});

test("next omits all free-form Sentry text from its summary", async () => {
  await withFixtureServer(
    {
      ...issue,
      culprit: "Riverside record",
      exception: "Bearer private-token for operator@example.com cost USD 123.45",
      permalink: "https://sentry.example/issues/101?label=Riverside",
      title: "Riverside failed for operator@example.com at USD 123.45",
    },
    async ({ environment }) => {
      const result = await runCli(["next", "--dry-run"], environment);
      assert.equal(result.code, 0, result.stderr);
      assert.doesNotMatch(
        result.stdout,
        /Riverside|operator@example\.com|private-token|123\.45/,
      );
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
    assert.equal(requests.length, 3);
    assert.equal(requests[0].method, "GET");
    assert.equal(
      requests[1].url,
      "/api/0/organizations/fixture-org/issues/101/events/latest/?environment=production",
    );
    assert.equal(requests[2].method, "PUT");
    assert.deepEqual(JSON.parse(requests[2].body), {
      status: "resolved",
      statusDetails: { inRelease: release },
    });
  });
});

test("resolve refuses a protected issue before mutation", async () => {
  await withFixtureServer(
    { ...issue, title: "Payments failed" },
    async ({ environment, requests }) => {
      const result = await runCli(
        ["resolve", "101", "--release", "b".repeat(40)],
        environment,
      );
      assert.equal(result.code, 2);
      assert.match(result.stderr, /protected-domain/);
      assert.equal(requests.some((request) => request.method === "PUT"), false);
    },
  );
});

test("resolve refuses an issue outside the configured project before mutation", async () => {
  await withFixtureServer(
    { ...issue, project: { slug: "another-project" } },
    async ({ environment, requests }) => {
      const result = await runCli(
        ["resolve", "101", "--release", "b".repeat(40)],
        environment,
      );
      assert.equal(result.code, 2);
      assert.match(result.stderr, /outside the configured Sentry project/);
      assert.equal(requests.some((request) => request.method === "PUT"), false);
    },
  );
});

test("resolve refuses an already resolved issue before mutation", async () => {
  await withFixtureServer(
    { ...issue, status: "resolved" },
    async ({ environment, requests }) => {
      const result = await runCli(
        ["resolve", "101", "--release", "b".repeat(40)],
        environment,
      );
      assert.equal(result.code, 2);
      assert.match(result.stderr, /not currently unresolved/);
      assert.equal(requests.some((request) => request.method === "PUT"), false);
    },
  );
});

test("resolve refuses a preview event before mutation", async () => {
  await withFixtureServer(
    { ...issue, environment: "preview" },
    async ({ environment, requests }) => {
      const result = await runCli(
        ["resolve", "101", "--release", "b".repeat(40)],
        environment,
      );
      assert.equal(result.code, 2);
      assert.match(result.stderr, /non-production/);
      assert.equal(requests.some((request) => request.method === "PUT"), false);
    },
  );
});

test("refuses to send the token to an untrusted API host", async () => {
  const result = await runCli(["next", "--dry-run"], {
    NODE_ENV: "production",
    SENTRY_AUTOFIX_API_BASE: "https://attacker.example.invalid",
    SENTRY_AUTOFIX_TOKEN: "fixture-token",
    NESTORY_SENTRY_ORG: "fixture-org",
    NESTORY_SENTRY_PROJECT: "fixture-project",
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /untrusted API host/);
});
