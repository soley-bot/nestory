import assert from 'node:assert/strict';
import test from 'node:test';
import { TARGET, RESET_TOOL_SOURCE_FILES, json, sha256, registrySha256 } from './pilot-finance-reset-core.mjs';
import { assertInventoryManifest, cloneIdentity, assertOwnedClone, assertSourceContainer, assertDiskSpace, assertDump, assertManifestRows, RECOVERY_MIN_FREE_BYTES, safeFailureMessage } from './pilot-finance-reset-recovery-core.mjs';
const hash = 'a'.repeat(64), now = Date.parse('2026-10-23T12:00:00Z');
const sign = value => ({ ...value, manifestSha256: sha256(json(value)) });
function manifest() {
  const globalCensus = [{ kind: 'census', table: 'public.people', rows: 1, sha256: hash }];
  return sign({ format: 'nestory-local-finance-reset-inventory-v1', syntheticOnly: true, inventoryAccepted: true, executionSupported: false, issues: [],
    binding: { project: TARGET.project, organization: TARGET.organization, cutoff: TARGET.cutoff, baseSha: TARGET.baseSha, fixtureSha256: TARGET.fixtureSha256,
      registrySha256: registrySha256(), cronLaunch: 'off',
      candidateHead: TARGET.baseSha,
      candidateSources: RESET_TOOL_SOURCE_FILES.map(name => ({ name, sha256: hash })),
      containerId: hash, schemaSha256: hash, migrationsSha256: hash, capturedAt: new Date(now).toISOString(),
      globalCensus, globalCensusSha256: sha256(json(globalCensus)) }, tables: [{ table: 'public.people' }] });
}
test('inventory must be accepted, untampered, current and bound to fixed synthetic source', () => {
  assertInventoryManifest(manifest(), now);
  for (const mutate of [m => { m.binding.organization = 'foreign'; }, m => { m.inventoryAccepted = false; }, m => { m.executionSupported = true; }, m => { m.issues = [{}]; }]) {
    const m = manifest(); mutate(m); assert.throws(() => assertInventoryManifest(m, now));
    delete m.manifestSha256; assert.throws(() => assertInventoryManifest(sign(m), now));
  }
  assert.throws(() => assertInventoryManifest(manifest(), now + 2 * 60 * 60_000 + 1), /stale/);
  assert.throws(() => assertInventoryManifest(manifest(), now - 60_001), /stale/);
});
test('inventory binds every adapter dependency and rejects missing or duplicate helpers', () => {
  for (const mutate of [
    sources => sources.pop(),
    sources => { sources[0] = sources[1]; },
    sources => { sources[0].name = 'scripts/unreviewed.mjs'; },
    sources => { sources[0].sha256 = 'bad'; },
  ]) {
    const m = manifest(); mutate(m.binding.candidateSources); delete m.manifestSha256;
    assert.throws(() => assertInventoryManifest(sign(m), now), /dependency binding/);
  }
});
test('cleanup refuses wrong database, OID, owner or marker', () => {
  const id = { ...cloneIdentity('12345678-1234-4123-8123-123456789abc'), oid: 1234 };
  const row = { name: id.database, oid: id.oid, owner: 'postgres', comment: id.marker };
  assertOwnedClone(id, row);
  for (const bad of [{ ...row, name: 'postgres' }, { ...row, oid: 1235 }, { ...row, oid: '1234' }, { ...row, owner: 'other' }, { ...row, comment: '' }, null]) assert.throws(() => assertOwnedClone(id, bad));
  assert.throws(() => cloneIdentity("';DROP DATABASE postgres;--"));
});
test('source identity cannot follow a replaced container or another project', () => {
  const source = { name: `/${TARGET.container}`, project: TARGET.project, id: hash, running: true, image: `sha256:${hash}` };
  assertSourceContainer(source, hash);
  for (const bad of [{ ...source, id: 'b'.repeat(64) }, { ...source, project: 'nestory' }, { ...source, running: false }, { ...source, image: 'latest' }]) assert.throws(() => assertSourceContainer(bad, hash));
});
test('space and dump limits fail closed before clone use', () => {
  assertDiskSpace(RECOVERY_MIN_FREE_BYTES); assertDump({ sha256: hash, bytes: 1 });
  for (const bad of [undefined, NaN, Infinity, RECOVERY_MIN_FREE_BYTES - 1]) assert.throws(() => assertDiskSpace(bad));
  for (const bad of [{ sha256: hash, bytes: 0 }, { sha256: hash, bytes: 256 * 1024 ** 2 + 1 }, { sha256: 'bad', bytes: 10 }]) assert.throws(() => assertDump(bad));
});
test('clone source must equal captured global rows, including foreign organizations', () => {
  const m = manifest(), rows = [{ kind: 'table', schema: 'public', name: 'people', rows: 1, sha256: hash }];
  assertManifestRows(m, rows);
  assert.throws(() => assertManifestRows(m, [{ ...rows[0], rows: 2 }]), /changed/);
  assert.throws(() => assertManifestRows(m, [{ ...rows[0], sha256: 'b'.repeat(64) }]), /changed/);
  assert.throws(() => assertManifestRows(m, [...rows, { kind: 'table', schema: 'app_private', name: 'unknown' }]), /outside/);
  assert.throws(() => assertManifestRows(m, []), /changed/);
  m.binding.globalCensus[0].rows = 2;
  assert.throws(() => assertManifestRows(m, rows), /digest/);
});
test('malformed inventory contents never enter the recovery report', () => {
  const sentinel = 'private-fixture-sentinel';
  let error;
  try { JSON.parse(`{"bad": ${sentinel}}`); } catch (caught) { error = caught; }
  assert.equal(safeFailureMessage(error), 'Malformed local JSON; contents withheld.');
  assert.ok(!safeFailureMessage(error).includes(sentinel));
});
