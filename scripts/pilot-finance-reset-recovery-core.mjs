import { TARGET, json, sha256, registrySha256, assertCandidateSources } from './pilot-finance-reset-core.mjs';

const digest = /^[a-f0-9]{64}$/;
export const RECOVERY_MIN_FREE_BYTES = 8 * 1024 ** 3;
export const safeFailureMessage = error => error instanceof SyntaxError ? 'Malformed local JSON; contents withheld.' : error.message;

export function assertInventoryManifest(manifest, now = Date.now()) {
  const { manifestSha256, ...payload } = manifest;
  if (!digest.test(manifestSha256 ?? '') || sha256(json(payload)) !== manifestSha256) throw Error('Inventory manifest digest mismatch.');
  if (manifest.format !== 'nestory-local-finance-reset-inventory-v1' || manifest.syntheticOnly !== true ||
      manifest.inventoryAccepted !== true || manifest.executionSupported !== false || manifest.issues?.length !== 0) {
    throw Error('Recovery requires an accepted local inventory, not execution authority.');
  }
  const binding = manifest.binding;
  if (!binding || binding.project !== TARGET.project || binding.organization !== TARGET.organization || binding.cutoff !== TARGET.cutoff ||
      binding.baseSha !== TARGET.baseSha || binding.fixtureSha256 !== TARGET.fixtureSha256 ||
      binding.registrySha256 !== registrySha256() || binding.cronLaunch !== 'off' ||
      !/^[a-f0-9]{40}$/.test(binding.candidateHead ?? '') ||
      !digest.test(binding.containerId ?? '') || !digest.test(binding.schemaSha256 ?? '') || !digest.test(binding.migrationsSha256 ?? '')) {
    throw Error('Inventory source binding mismatch.');
  }
  // Time is an explicit runner input for repeatable tests; a manifest cannot be
  // used indefinitely after the local checkpoint it describes.
  const age = now - Date.parse(binding.capturedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 2 * 60 * 60_000) throw Error('Inventory capture is stale or invalid.');
  assertCandidateSources(binding.candidateSources);
  return binding;
}

export function cloneIdentity(uuid) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(uuid)) throw Error('Clone identity requires a generated UUID.');
  return { database: `pilot_recovery_${uuid.replaceAll('-', '')}`, marker: `nestory-pilot-clone:${uuid}`, dumpPath: `/tmp/nestory-pilot-clone-${uuid}.dump` };
}

export function assertOwnedClone(identity, record) {
  if (!/^pilot_recovery_[a-f0-9]{32}$/.test(identity.database) || !record || record.name !== identity.database ||
      record.comment !== identity.marker || record.owner !== 'postgres' || !Number.isSafeInteger(identity.oid) ||
      identity.oid <= 0 || record.oid !== identity.oid) throw Error('Refusing a clone without this run\'s exact OID, owner and marker.');
}

export function assertSourceContainer(inspect, containerId) {
  if (inspect.name !== `/${TARGET.container}` || inspect.project !== TARGET.project || inspect.id !== containerId ||
      !digest.test(containerId ?? '') || inspect.running !== true || !/^sha256:[a-f0-9]{64}$/.test(inspect.image ?? '')) {
    throw Error('Dedicated source container changed.');
  }
}

export function assertDiskSpace(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < RECOVERY_MIN_FREE_BYTES) throw Error('Clone rehearsal needs at least 8 GiB available.');
}

export function assertDump(dump) {
  if (!digest.test(dump.sha256 ?? '') || !Number.isSafeInteger(dump.bytes) || dump.bytes < 1 || dump.bytes > 256 * 1024 ** 2) {
    throw Error('Clone dump size or digest is invalid.');
  }
}

export function assertManifestRows(manifest, census) {
  const declared = manifest.binding.globalCensus;
  if (!Array.isArray(declared) || sha256(json(declared)) !== manifest.binding.globalCensusSha256) {
    throw Error('Inventory global census digest mismatch.');
  }
  for (const table of manifest.tables) {
    const actual = census.find(row => row.kind === 'table' && `${row.schema}.${row.name}` === table.table);
    const expected = declared.filter(row => row.table === table.table);
    if (expected.length !== 1 || !actual || actual.rows !== expected[0].rows || actual.sha256 !== expected[0].sha256) throw Error(`Inventory table changed: ${table.table}`);
  }
  const represented = new Set(manifest.tables.map(table => table.table));
  if (census.some(row => row.kind === 'table' && ['public', 'app_private'].includes(row.schema) && !represented.has(`${row.schema}.${row.name}`))) {
    throw Error('Source contains a table outside the accepted inventory.');
  }
}
