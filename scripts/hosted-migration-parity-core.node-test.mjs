import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateHostedMigrationParity,
  readMigrationListOutput,
  readMigrationVersions,
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
    result.issues.includes(
      "unknown remote migration version: 20260803000000",
    ),
  );
  assert.deepEqual(result.pendingVersions, []);
});

test("preflight rejects a hosted history hole even when every version exists in Git", () => {
  const result = evaluateHostedMigrationParity({
    localVersions: [
      "20260801000000",
      "20260802000000",
      "20260803000000",
    ],
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
    [
      "no local migration versions found",
      "no remote migration versions found",
    ],
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
