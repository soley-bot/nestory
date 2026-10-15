import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { target } from "./ips-integrated-readiness-fixture.mjs";
import { sha256 } from "./ips-readiness-recovery-core.mjs";
import { describeMigrationStatement } from "./hosted-migration-parity-core.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import { approveRentManifest, censusHash, rentBoundarySql, rentManifestMaxAgeMs, validateRentEnvironment, verifyRentApiContainer, verifyRentBoundary, verifyRentMigrations, verifyWorkingRentMigrations } from "./rent-readiness-target.mjs";

const now = Date.parse("2026-10-15T12:00:00.000Z"), gitSha = "a".repeat(40), containerId = "b".repeat(64);
const baselineBytes = Buffer.from("preserved baseline provenance"), sourceHashes = { harness: "c".repeat(64) };
const org = "00000000-0000-0000-0000-000000000001", actor = "00000000-0000-0000-0000-000000000101";
const newId = "70000000-0000-4000-8000-000000000001";
const localMigrations = [{ version: "20261015005100", name: "rent_test", body: "SELECT 1;\r\n" }];
const migrations = [{ version: "20261015005100", name: "rent_test", statements: [describeMigrationStatement("SELECT 1")] }];
const census = { organizationIds: [org], authUserIds: [actor] };
const observed = { database: "postgres", versionMajor: 17, migrations, census };
const manifest = { schemaVersion: 1, sourceKind: "retained-readiness-stack", checkedAt: new Date(now).toISOString(),
  target, containerId, apiContainerId: "d".repeat(64), gitSha, sourceHashes, baselineManifestSha256: sha256(baselineBytes),
  census, censusSha256: censusHash(census), migrations: verifyRentMigrations(localMigrations, migrations), migrationHead: "20261015005100" };
const bytes = Buffer.from(JSON.stringify(manifest)), approvedSha256 = sha256(bytes);
const valid = { bytes, approvedSha256, baselineBytes, gitSha, sourceHashes, now };

test("retained capture cannot authorize itself; exact coordinator hash and preserved baseline bytes are required", () => {
  assert.deepEqual(approveRentManifest(valid), manifest);
  for (const override of [{ approvedSha256: undefined }, { approvedSha256: "d".repeat(64) },
    { bytes: Buffer.from(JSON.stringify({ ...manifest, censusSha256: "d".repeat(64) })) },
    { baselineBytes: Buffer.from("changed provenance") }, { gitSha: "e".repeat(40) }, { sourceHashes: {} }]) {
    assert.throws(() => approveRentManifest({ ...valid, ...override }));
  }
});

test("freshness rejects future timestamps, expiration and expiration before a later write", () => {
  for (const clock of [now - 1, now + rentManifestMaxAgeMs + 1]) {
    assert.throws(() => approveRentManifest({ ...valid, now: clock }));
    assert.throws(() => verifyRentBoundary({ manifest, observed, localMigrations, now: clock }));
  }
});

test("target environment rejects default stack, wrong ports/hosts, missing handoffs and partial container IDs", () => {
  const input = { cwd: path.resolve("ips-production-readiness-20261014"),
    config: `project_id = "${target.project}"\n[api]\nport = 59321\n[db]\nport = 59322\n[auth]\n`,
    env: { IPS_LOCAL_HANDOFF: target.project, IPS_RENT_HANDOFF: target.project, IPS_RENT_RETAINED_HANDOFF: target.project,
      NESTORY_BASE_URL: target.app, SUPABASE_DB_CONTAINER: target.container, IPS_RENT_CONTAINER_ID: containerId } };
  assert.doesNotThrow(() => validateRentEnvironment(input));
  for (const key of Object.keys(input.env)) assert.throws(() => validateRentEnvironment({ ...input, env: { ...input.env, [key]: "wrong" } }));
  for (const config of [input.config.replace("59321", "54321"), input.config.replace("59322", "58322"),
    input.config.replace(target.project, "nestory"), input.config.replace("[auth]", "port = 54322\n[auth]")]) {
    assert.throws(() => validateRentEnvironment({ ...input, config }));
  }
  assert.throws(() => validateRentEnvironment({ ...input, cwd: path.resolve("deposit-release-20261009") }));
});

test("migration verification checks every identity and actual statement payload against Git", () => {
  assert.equal(verifyRentMigrations(localMigrations, migrations).length, 1);
  for (const remote of [[], [...migrations, ...migrations], [{ ...migrations[0], version: "20261015005101" }],
    [{ ...migrations[0], name: "other_name" }], [{ ...migrations[0], statements: [describeMigrationStatement("SELECT 2")] }],
    [{ ...migrations[0], statements: [] }]]) assert.throws(() => verifyRentMigrations(localMigrations, remote));
  assert.throws(() => verifyRentMigrations([{ ...localMigrations[0], body: "SELECT 1; SELECT 2;" }], migrations));
  assert.throws(() => verifyRentBoundary({ manifest: { ...manifest, migrationHead: "20261015005101" }, observed, localMigrations, now }));
});

test("dirty, missing and extra working migrations cannot be labeled as the pinned commit", () => {
  const committed = [{ ...localMigrations[0], body: "SELECT 1;\n" }];
  assert.doesNotThrow(() => verifyWorkingRentMigrations(committed, localMigrations));
  for (const working of [[], [...localMigrations, { version: "20261015005101", name: "untracked", body: "SELECT 2;" }],
    [{ ...localMigrations[0], body: "SELECT 2;\n" }], [{ ...localMigrations[0], body: " SELECT 1;\n" }],
    [{ ...localMigrations[0], body: "\uFEFFSELECT 1;\n" }]]) assert.throws(() => verifyWorkingRentMigrations(committed, working));
});

test("API gateway must be this running project's exact container and 59321 binding", () => {
  const api = { name: `/supabase_kong_${target.project}`, id: "d".repeat(64), project: target.project,
    running: true, ports: [{ HostIp: "127.0.0.1", HostPort: "59321" }] };
  assert.doesNotThrow(() => verifyRentApiContainer(api, api.id));
  for (const change of [{ name: "/supabase_kong_nestory" }, { id: "e".repeat(64) }, { running: false },
    { project: "nestory" }, { ports: [{ HostIp: "127.0.0.1", HostPort: "54321" }] }, { ports: [] },
    { ports: [{ HostIp: "192.0.2.1", HostPort: "59321" }] }]) assert.throws(() => verifyRentApiContainer({ ...api, ...change }, api.id));
});

test("retained target cannot use a remote Docker endpoint or environment override", async () => {
  let invoked = false;
  await assert.rejects(localRecoveryDocker({ env: { DOCKER_HOST: "tcp://example.test:2375" }, platform: "win32", execute: () => { invoked = true; } }));
  assert.equal(invoked, false);
  await assert.rejects(localRecoveryDocker({ env: {}, platform: "win32", execute: (_command, args) => args[1] === "show" ? "remote" : JSON.stringify("ssh://example.test") }));
});

test("full live census rejects unknown, missing, duplicate and truncated identities", () => {
  assert.doesNotThrow(() => verifyRentBoundary({ manifest, observed, localMigrations, now }));
  for (const bad of [{ ...census, organizationIds: [] }, { ...census, authUserIds: [] },
    { ...census, organizationIds: [org, newId] }, { ...census, authUserIds: [actor, newId] },
    { ...census, authUserIds: [actor, actor] }, { ...census, authUserIds: null }]) {
    assert.throws(() => verifyRentBoundary({ manifest, observed: { ...observed, census: bad }, localMigrations, now }));
  }
  const tampered = Buffer.from(JSON.stringify({ ...manifest, census: { ...census, authUserIds: [actor, newId] } }));
  assert.throws(() => approveRentManifest({ ...valid, bytes: tampered, approvedSha256: sha256(tampered) }));
});

test("only observed owned UUID additions are permitted after this run creates them", () => {
  const additions = { organizationIds: [], authUserIds: [newId] };
  const grown = { ...observed, census: { ...census, authUserIds: [actor, newId] } };
  assert.doesNotThrow(() => verifyRentBoundary({ manifest, observed: grown, localMigrations, additions, now }));
  assert.throws(() => verifyRentBoundary({ manifest, observed, localMigrations, additions, now }));
  assert.throws(() => verifyRentBoundary({ manifest, observed, localMigrations, additions: { organizationIds: [org], authUserIds: [] }, now }));
  assert.match(rentBoundarySql, /REPEATABLE READ READ ONLY/);
  assert.match(rentBoundarySql, /FROM auth\.users/); assert.match(rentBoundarySql, /FROM public\.organizations/);
  assert.doesNotMatch(rentBoundarySql, /LIMIT|encrypted_password|access_token|refresh_token/i);
});
