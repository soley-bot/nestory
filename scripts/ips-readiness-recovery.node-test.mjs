import assert from "node:assert/strict";
import test from "node:test";
import { assertFixtureIdentities, assertRecoveryCleanup, assertRecoveryContainer, assertRecoverySource, assertUniqueObjectKeys, compareEvidence, FIXTURE_ORGANIZATION, FIXTURE_USERS, RECOVERY_CONTAINER, RECOVERY_PROJECT, recoveryIdentity, sha256, tableCensusSql } from "./ips-readiness-recovery-core.mjs";

const uuid = "34567890-1234-4234-8234-123456789012";
const fixtureHash = sha256("synthetic fixture");
const manifest = { project: RECOVERY_PROJECT, containerId: "a".repeat(64), fixtureSha256: fixtureHash, loadedAt: "2026-10-14T13:00:00Z", sourceKind: "fresh-reset-plus-committed-synthetic-baseline", organizationIds: FIXTURE_ORGANIZATION, authUserIds: FIXTURE_USERS };
const validSource = { config: `project_id = "${RECOVERY_PROJECT}"`, manifest, fixtureHash, now: Date.parse("2026-10-14T13:05:00Z") };

test("only the recorded local readiness project and fresh synthetic identities are accepted", () => {
  assert.doesNotThrow(() => assertRecoverySource(validSource));
  for (const change of [
    { config: 'project_id = "nestory"' }, { explicitContainer: "supabase_db_deposit" }, { fixtureHash: "b".repeat(64) },
    { manifest: { ...manifest, containerId: "short" } }, { now: Date.parse("2026-10-15T13:00:00Z") },
    { manifest: { ...manifest, organizationIds: [FIXTURE_ORGANIZATION, uuid] } },
    { manifest: { ...manifest, authUserIds: [...FIXTURE_USERS, uuid] } },
  ]) assert.throws(() => assertRecoverySource({ ...validSource, ...change }));
});

test("container replacement, wrong project and stopped containers fail closed", () => {
  const good = { name: `/${RECOVERY_CONTAINER}`, id: manifest.containerId, running: true, project: RECOVERY_PROJECT, image: `sha256:${"b".repeat(64)}` };
  assert.doesNotThrow(() => assertRecoveryContainer(good, manifest.containerId));
  for (const change of [{ id: "b".repeat(64) }, { name: "/shared" }, { project: "shared" }, { running: false }]) assert.throws(() => assertRecoveryContainer({ ...good, ...change }, manifest.containerId));
});

test("cleanup requires generated name, exact nonce, original oid and owner", () => {
  const identity = { ...recoveryIdentity(uuid), oid: 1234 };
  const row = { name: identity.database, comment: identity.marker, oid: 1234, owner: "postgres" };
  assert.doesNotThrow(() => assertRecoveryCleanup(identity, row));
  for (const change of [{ name: "postgres" }, { comment: null }, { comment: "other" }, { oid: 2345 }, { owner: "other" }]) assert.throws(() => assertRecoveryCleanup(identity, { ...row, ...change }));
  assert.throws(() => assertRecoveryCleanup({ ...identity, oid: undefined }, { ...row, oid: undefined }));
  assert.throws(() => assertRecoveryCleanup(identity, undefined));
  assert.throws(() => recoveryIdentity("postgres"));
});

test("counts and row hashes must both match and identity drift cannot pass", () => {
  const rows = [{ name: "invoices", rows: 1201, sha256: "a" }];
  assert.equal(compareEvidence(rows, [...rows], "tables").length, 64);
  assert.throws(() => compareEvidence(rows, [{ ...rows[0], rows: 1000 }], "tables"));
  assert.throws(() => compareEvidence(rows, [{ ...rows[0], sha256: "b" }], "tables"));
  assert.throws(() => assertFixtureIdentities({ organizationIds: FIXTURE_ORGANIZATION, authUserIds: [] }));
  assert.match(tableCensusSql, /REPEATABLE READ READ ONLY/);
  assert.doesNotMatch(tableCensusSql, /INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP/);
});

test("PostgreSQL OID JSON must be numeric before a clone can pass cleanup", () => {
  const identity = { ...recoveryIdentity(uuid), oid: 33519 };
  // jsonb_build_object on PostgreSQL's oid type produces a JSON string;
  // the runner explicitly casts oid to bigint when recording its identity.
  const uncast = JSON.parse(`{"oid":"33519","name":"${identity.database}","owner":"postgres","comment":"${identity.marker}"}`);
  assert.throws(() => assertRecoveryCleanup(identity, uncast));
  assert.doesNotThrow(() => assertRecoveryCleanup(identity, { ...uncast, oid: 33519 }));
  assert.throws(() => assertRecoveryCleanup(identity, { ...uncast, oid: 33520 }));
});

test("schema identities preserve long distinct names and reject collisions", () => {
  const prefix = "column.app_private.finance_account_activity_authority_history.";
  const objects = ["authority_before", "authority_after"].map(suffix => ({ kind: "column", name: prefix + suffix }));
  assert.doesNotThrow(() => assertUniqueObjectKeys(objects));
  assert.throws(() => assertUniqueObjectKeys(objects.map(object => ({ ...object, name: object.name.slice(0, 63) }))));
});
