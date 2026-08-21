import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  evaluateHostedMigrationContent,
  evaluateHostedMigrationParity,
  readHostedMigrationLedgerOutput,
  readMigrationListOutput,
  readMigrationVersions,
  resolvePinnedSupabaseCliBinary,
  runCommandWithBoundedOutput,
} from "./hosted-migration-parity-core.mjs";

test("preflight accepts only an ordered pending Git suffix", () => {
  assert.deepEqual(
    evaluateHostedMigrationParity({
      localVersions: ["20260801000000", "20260802000000"],
      remoteVersions: ["20260801000000"],
      phase: "preflight",
    }),
    {
      issues: [],
      localCount: 2,
      remoteCount: 1,
      pendingVersions: ["20260802000000"],
    },
  );
});

test("preflight fails closed on unknown hosted versions", () => {
  const result = evaluateHostedMigrationParity({
    localVersions: ["20260801000000", "20260802000000"],
    remoteVersions: ["20260801000000", "20260803000000"],
    phase: "preflight",
  });

  assert.ok(
    result.issues.includes("unknown remote migration version: 20260803000000"),
  );
  assert.deepEqual(result.pendingVersions, []);
});

test("preflight rejects a hosted history hole even when every version exists in Git", () => {
  const result = evaluateHostedMigrationParity({
    localVersions: ["20260801000000", "20260802000000", "20260803000000"],
    remoteVersions: ["20260801000000", "20260803000000"],
    phase: "preflight",
  });

  assert.ok(
    result.issues.includes(
      "remote migration history is not an exact Git prefix at position 2: expected 20260802000000, found 20260803000000",
    ),
  );
  assert.deepEqual(result.pendingVersions, []);
});

test("postflight requires exact local and hosted equality", () => {
  const result = evaluateHostedMigrationParity({
    localVersions: ["20260801000000", "20260802000000"],
    remoteVersions: ["20260801000000"],
    phase: "postflight",
  });

  assert.deepEqual(result.pendingVersions, ["20260802000000"]);
  assert.ok(
    result.issues.includes(
      "postflight still has pending local migration: 20260802000000",
    ),
  );
});

test("rejects malformed and duplicate migration versions", () => {
  const result = evaluateHostedMigrationParity({
    localVersions: ["20260801000000", "bad-version", "20260801000000"],
    remoteVersions: ["20260801000000", "20260801000000"],
    phase: "preflight",
  });

  assert.deepEqual(result.issues, [
    "invalid local migration version: bad-version",
    "duplicate local migration version: 20260801000000",
    "duplicate remote migration version: 20260801000000",
  ]);
});

test("fails closed when either migration history is empty", () => {
  assert.deepEqual(
    evaluateHostedMigrationParity({
      localVersions: [],
      remoteVersions: [],
      phase: "preflight",
    }).issues,
    ["no local migration versions found", "no remote migration versions found"],
  );
});

test("reads the complete local and remote sets from Supabase migration-list JSON", () => {
  assert.deepEqual(
    readMigrationVersions({
      migrations: [
        { local: "20260801000000", remote: "20260801000000" },
        { local: "20260802000000", remote: "" },
        { local: "", remote: "20260803000000" },
      ],
    }),
    {
      localVersions: ["20260801000000", "20260802000000"],
      remoteVersions: ["20260801000000", "20260803000000"],
    },
  );
});

test("reads local-only and remote-only rows from Supabase migration-list text", () => {
  assert.deepEqual(
    readMigrationListOutput(`
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260801000000 | 20260801000000 | 2026-08-01 00:00:00
   20260802000000 |                | 2026-08-02 00:00:00
                  | 20260803000000 | 2026-08-03 00:00:00
`),
    {
      localVersions: ["20260801000000", "20260802000000"],
      remoteVersions: ["20260801000000", "20260803000000"],
    },
  );
});

test("verifies hosted names and statement payloads against Git migrations", () => {
  assert.deepEqual(
    evaluateHostedMigrationContent({
      localMigrations: [
        {
          version: "20260801000000",
          name: "create_example",
          body: "-- retained comment\r\ncreate table public.example (id uuid);\r\n\r\ninsert into public.example values ('00000000-0000-0000-0000-000000000000');\r\n",
        },
      ],
      remoteMigrations: [
        {
          version: "20260801000000",
          name: "create_example",
          statements: [
            "-- retained comment\ncreate table public.example (id uuid)",
            "insert into public.example values ('00000000-0000-0000-0000-000000000000')",
          ],
        },
      ],
    }),
    [],
  );
});

test("rejects a hosted migration whose name or SQL differs from Git", () => {
  assert.deepEqual(
    evaluateHostedMigrationContent({
      localMigrations: [
        {
          version: "20260801000000",
          name: "create_example",
          body: "create table public.example (id uuid);\n",
        },
        {
          version: "20260802000000",
          name: "insert_example",
          body: "insert into public.example values ('git');\n",
        },
      ],
      remoteMigrations: [
        {
          version: "20260801000000",
          name: "wrong_name",
          statements: ["create table public.example (id uuid)"],
        },
        {
          version: "20260802000000",
          name: "insert_example",
          statements: ["insert into public.example values ('hosted')"],
        },
      ],
    }),
    [
      "hosted migration name mismatch for 20260801000000: expected create_example, found wrong_name",
      "hosted migration SQL mismatch for 20260802000000",
    ],
  );
});

test("accepts only an exact pinned legacy hosted-content exception", () => {
  const localMigrations = [
    {
      version: "20260801000000",
      name: "create_example",
      body: "select 'git';\n",
    },
  ];
  const contentExceptions = [
    {
      version: "20260801000000",
      name: "create_example",
      gitSqlSha256:
        "fd8667e957bea0168e08f2692e10164de164f5aa9b8312888d70a1e635d81146",
      hostedLedgerSha256:
        "2ddecc6993fb0e2c2ea24ae0a9e42420d27450eef2ef68f6f322da1056777260",
    },
  ];

  assert.deepEqual(
    evaluateHostedMigrationContent({
      localMigrations,
      remoteMigrations: [
        {
          version: "20260801000000",
          name: "create_example",
          statements: ["select 'hosted'"],
        },
      ],
      contentExceptions,
    }),
    [],
  );

  assert.deepEqual(
    evaluateHostedMigrationContent({
      localMigrations,
      remoteMigrations: [
        {
          version: "20260801000000",
          name: "create_example",
          statements: ["select 'changed'"],
        },
      ],
      contentExceptions,
    }),
    [
      "hosted migration SQL mismatch for 20260801000000 (pinned exception does not match)",
    ],
  );
});

test("reads hosted migration ledger rows from Supabase db-query JSON", () => {
  assert.deepEqual(
    readHostedMigrationLedgerOutput(
      JSON.stringify({
        boundary: "untrusted",
        rows: [
          {
            version: "20260801000000",
            name: "create_example",
            statements: ["select 1"],
          },
        ],
      }),
    ),
    [
      {
        version: "20260801000000",
        name: "create_example",
        statements: ["select 1"],
      },
    ],
  );
});

test("streams hosted ledger payloads larger than the Node default buffer", async () => {
  const expectedBytes = 2 * 1024 * 1024;
  const result = await runCommandWithBoundedOutput(
    process.execPath,
    ["-e", `process.stdout.write("x".repeat(${expectedBytes}))`],
    { cwd: process.cwd(), env: process.env },
  );

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, expectedBytes);
});

test("streams CLI output while enforcing an explicit capture limit", async () => {
  const result = await runCommandWithBoundedOutput(
    process.execPath,
    ["-e", 'process.stdout.write("x".repeat(2048))'],
    { cwd: process.cwd(), env: process.env, maxBuffer: 1024 },
  );

  assert.match(
    result.error?.message ?? "",
    /stdout exceeded 1024 byte capture limit/,
  );
});

test("resolves the pinned native Supabase CLI without the npm exec shim", () => {
  const binary = resolvePinnedSupabaseCliBinary();

  assert.match(path.basename(binary), /^supabase(?:\.exe)?$/);
  assert.doesNotMatch(binary, /[\\/]supabase[\\/]dist[\\/]supabase\.js$/);
});
