import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  canonicalMigrationHash,
  describeMigrationStatement,
  evaluateHostedMigrationHashes,
  evaluateHostedMigrationParity,
  hashGitMigrationBody,
  isMigrationBodyEffectivelyEmpty,
  readHostedMigrationHashOutput,
  readMigrationListOutput,
  readMigrationVersions,
  reconstructLocalMigrationDescriptors,
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

test("preflight rejects a hosted history hole", () => {
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
});

test("postflight requires exact local and hosted equality", () => {
  const result = evaluateHostedMigrationParity({
    localVersions: ["20260801000000", "20260802000000"],
    remoteVersions: ["20260801000000"],
    phase: "postflight",
  });
  assert.ok(
    result.issues.includes(
      "postflight still has pending local migration: 20260802000000",
    ),
  );
});

test("rejects malformed, duplicate, and empty migration histories", () => {
  assert.deepEqual(
    evaluateHostedMigrationParity({
      localVersions: ["20260801000000", "bad", "20260801000000"],
      remoteVersions: [],
      phase: "preflight",
    }).issues,
    [
      "invalid local migration version: bad",
      "duplicate local migration version: 20260801000000",
      "no remote migration versions found",
    ],
  );
});

test("reads complete local and remote sets from migration-list JSON and text", () => {
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

test("reconstructs ordinary Git SQL from hosted length and hash descriptors", () => {
  const migration = makeRemoteMigration({
    version: "20260801000000",
    name: "create_example",
    statements: ["select 1", "select 2"],
  });
  assert.deepEqual(
    reconstructLocalMigrationDescriptors(
      " \r\nselect 1;\r\n\r\nselect 2;\r\n",
      migration.statements,
    ),
    { statements: migration.statements },
  );
});

test("ordinary hosted hashes require exact Git, manifest, and ledger equality", () => {
  const local = {
    version: "20260801000000",
    name: "create_example",
    body: "select 1;\nselect 2;\n",
  };
  const remote = makeRemoteMigration({
    version: local.version,
    name: local.name,
    statements: ["select 1", "select 2"],
  });
  assert.deepEqual(
    evaluateHostedMigrationHashes({
      localMigrations: [local],
      remoteVersions: [local.version],
      remoteMigrations: [remote],
      manifestEntries: [makeManifestEntry(local, remote)],
    }),
    [],
  );
});

test("a one-byte SQL change changes the canonical hash and fails closed", () => {
  const original = makeRemoteMigration({
    version: "20260801000000",
    name: "create_example",
    statements: ["select 1"],
  });
  const changedDescriptor = describeMigrationStatement("select 2");
  assert.notEqual(
    original.canonicalSha256,
    canonicalMigrationHash({
      version: original.version,
      name: original.name,
      statements: [changedDescriptor],
    }),
  );

  const changedLocal = {
    version: original.version,
    name: original.name,
    body: "select 2;\n",
  };
  assert.ok(
    evaluateHostedMigrationHashes({
      localMigrations: [changedLocal],
      remoteVersions: [original.version],
      remoteMigrations: [original],
      manifestEntries: [makeManifestEntry(changedLocal, original)],
    }).includes(`hosted migration SQL mismatch for ${original.version}`),
  );
});

test("empty migrations are detected before push and zero-statement rows remain hashable", () => {
  assert.equal(isMigrationBodyEffectivelyEmpty("\uFEFF; -- note\n/* outer /* nested */ note */\n"), true);
  assert.equal(isMigrationBodyEffectivelyEmpty("/* note */\nselect 1;\n"), false);

  const version = "20260801000000";
  const name = "empty_example";
  const canonicalSha256 = canonicalMigrationHash({
    version,
    name,
    statements: [],
  });
  const [parsed] = readHostedMigrationHashOutput(
    JSON.stringify({
      rows: [
        {
          version,
          name,
          statement_count: 0,
          statement_bytes: 0,
          statement_descriptors: [],
          canonical_sha256: canonicalSha256,
          hosted_ledger_db_sha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
  );
  assert.equal(parsed.statementCount, 0);
  assert.equal(parsed.canonicalSha256, canonicalSha256);
});

test("legacy exceptions require separately pinned Git and hosted hashes", () => {
  const local = {
    version: "20260801000000",
    name: "create_example",
    body: "select 'git';\n",
  };
  const remote = makeRemoteMigration({
    version: local.version,
    name: local.name,
    statements: ["select 'hosted'"],
    hostedLedgerDbSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const exception = {
    version: local.version,
    name: local.name,
    gitSqlSha256: hashGitMigrationBody(local.body),
    hostedLedgerSha256:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    hostedLedgerDbSha256: remote.hostedLedgerDbSha256,
  };
  const manifest = {
    ...makeManifestEntry(local, remote),
    legacyException: true,
  };
  assert.deepEqual(
    evaluateHostedMigrationHashes({
      localMigrations: [local],
      remoteVersions: [local.version],
      remoteMigrations: [remote],
      manifestEntries: [manifest],
      contentExceptions: [exception],
    }),
    [],
  );

  assert.ok(
    evaluateHostedMigrationHashes({
      localMigrations: [local],
      remoteVersions: [local.version],
      remoteMigrations: [
        {
          ...remote,
          hostedLedgerDbSha256:
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      ],
      manifestEntries: [manifest],
      contentExceptions: [exception],
    }).includes(
      `hosted migration SQL mismatch for ${local.version} (pinned exception does not match)`,
    ),
  );
});

test("requires exact remote coverage and a non-empty manifest prefix", () => {
  const local = {
    version: "20260801000000",
    name: "create_example",
    body: "select 1;\n",
  };
  const remote = makeRemoteMigration({
    version: local.version,
    name: local.name,
    statements: ["select 1"],
  });
  const issues = evaluateHostedMigrationHashes({
    localMigrations: [local],
    remoteVersions: [local.version, "20260802000000"],
    remoteMigrations: [remote],
    manifestEntries: [],
  });
  assert.ok(
    issues.includes(
      "hosted hash query did not return every ledger version exactly once",
    ),
  );
  assert.ok(
    issues.includes(
      "hosted migration hash manifest is not an exact non-empty ledger prefix",
    ),
  );
});

test("a pinned baseline permits a later ordinary migration after exact comparison", () => {
  const baseline = {
    version: "20260801000000",
    name: "create_example",
    body: "select 1;\n",
  };
  const later = {
    version: "20260802000000",
    name: "extend_example",
    body: "select 2;\n",
  };
  const baselineRemote = makeRemoteMigration({
    version: baseline.version,
    name: baseline.name,
    statements: ["select 1"],
  });
  const laterRemote = makeRemoteMigration({
    version: later.version,
    name: later.name,
    statements: ["select 2"],
  });
  assert.deepEqual(
    evaluateHostedMigrationHashes({
      localMigrations: [baseline, later],
      remoteVersions: [baseline.version, later.version],
      remoteMigrations: [baselineRemote, laterRemote],
      manifestEntries: [makeManifestEntry(baseline, baselineRemote)],
    }),
    [],
  );
});

test("reads only deterministic hosted hash descriptors from db-query JSON", () => {
  const remote = makeRemoteMigration({
    version: "20260801000000",
    name: "create_example",
    statements: ["select 1"],
  });
  assert.deepEqual(
    readHostedMigrationHashOutput(
      JSON.stringify({
        rows: [
          {
            version: remote.version,
            name: remote.name,
            statement_count: remote.statementCount,
            statement_bytes: remote.statementBytes,
            statement_descriptors: remote.statements,
            canonical_sha256: remote.canonicalSha256,
            hosted_ledger_db_sha256: remote.hostedLedgerDbSha256,
          },
        ],
      }),
    ),
    [remote],
  );
});

test("production verifier forces agent JSON and never transports raw statements", () => {
  const source = readFileSync(
    new URL("./verify-hosted-migration-parity.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /"--agent",\s*"yes"/);
  assert.match(source, /left join statement_hashes as statement/i);
  assert.match(source, /pending local migration is empty or comment-only/);
  assert.doesNotMatch(source, /select version, name, statements from/i);
});

test("streams CLI output while enforcing an explicit capture limit", async () => {
  const expectedBytes = 2 * 1024 * 1024;
  const success = await runCommandWithBoundedOutput(
    process.execPath,
    ["-e", `process.stdout.write("x".repeat(${expectedBytes}))`],
    { cwd: process.cwd(), env: process.env },
  );
  assert.equal(success.error, undefined);
  assert.equal(success.stdout.length, expectedBytes);

  const overflow = await runCommandWithBoundedOutput(
    process.execPath,
    ["-e", 'process.stdout.write("x".repeat(2048))'],
    { cwd: process.cwd(), env: process.env, maxBuffer: 1024 },
  );
  assert.match(
    overflow.error?.message ?? "",
    /stdout exceeded 1024 byte capture limit/,
  );
});

test("resolves the pinned native Supabase CLI without the npm exec shim", () => {
  const binary = resolvePinnedSupabaseCliBinary();
  assert.match(path.basename(binary), /^supabase(?:\.exe)?$/);
  assert.doesNotMatch(binary, /[\\/]supabase[\\/]dist[\\/]supabase\.js$/);
});

function makeRemoteMigration({
  version,
  name,
  statements,
  hostedLedgerDbSha256 =
    "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
}) {
  const descriptors = statements.map(describeMigrationStatement);
  return {
    version,
    name,
    statementCount: descriptors.length,
    statementBytes: descriptors.reduce(
      (total, statement) => total + statement.byteLength,
      0,
    ),
    statements: descriptors,
    canonicalSha256: canonicalMigrationHash({
      version,
      name,
      statements: descriptors,
    }),
    hostedLedgerDbSha256,
  };
}

function makeManifestEntry(local, remote) {
  return {
    version: local.version,
    name: local.name,
    gitSqlSha256: hashGitMigrationBody(local.body),
    canonicalSha256: remote.canonicalSha256,
  };
}
