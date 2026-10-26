// Native local clone adapter. This module has no URL/database/organization CLI.
// All financial writes target a freshly-created OID/owner/comment-pinned clone.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, realpath, mkdir, lstat, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TARGET, json, sha256, normalizedSource, assertLocalContainer, assertLocalSource, identitySql } from './pilot-finance-reset-core.mjs';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { assertInventoryManifest, assertOwnedClone, assertSourceContainer, assertDiskSpace, assertDump, assertManifestRows, cloneIdentity } from './pilot-finance-reset-recovery-core.mjs';
import { schemaCensusSql, tableCensusSql, parseJsonLines, compareEvidence, assertUniqueObjectKeys } from './ips-readiness-recovery-core.mjs';
import { reconstructLocalMigrationDescriptors } from './hosted-migration-parity-core.mjs';
import { materializeRestoreActions, assertCheckedPhaseReview, orderRecoverySources } from './pilot-finance-reset-executor-plan.mjs';

const root = path.resolve(import.meta.dirname, '..');
const projectRoot = path.join(os.tmpdir(), 'nestory-pilot-reset-db-20261023');
const evidenceRoot = path.resolve(root, '..', 'technical-readiness', 'pilot-reset-20261023', 'implementation', 'rehearsals');
const hash = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = value => {
  if (!/^[a-z][a-z0-9_]*$/.test(value ?? '')) throw Error('Invalid catalog identifier.');
  return `"${value}"`;
};
const relation = value => {
  const parts = value?.split('.') ?? [];
  if (parts.length !== 2 || !['public', 'app_private'].includes(parts[0])) throw Error('Invalid financial action relation.');
  return parts.map(identifier).join('.');
};
export const EXECUTOR_SOURCE_FILES = Object.freeze([
  'scripts/pilot-finance-reset-executor-local.mjs', 'scripts/pilot-finance-reset-executor-plan.mjs',
  'scripts/pilot-finance-reset-retired-journal-core.mjs',
]);

export function assertResetPrerequisites({ inventory, recoveryProof, materialized, executorSources }, now = Date.now()) {
  assertInventoryManifest(inventory, now);
  if (!recoveryProof || recoveryProof.format !== 'nestory-local-database-clone-proof-v1' || recoveryProof.completed !== true ||
      recoveryProof.databaseCloneProven !== true || recoveryProof.cleanup?.cloneDropped !== true ||
      recoveryProof.cleanup?.dumpRemoved !== true || recoveryProof.manifestSha256 !== inventory.manifestSha256 ||
      json(recoveryProof.binding) !== json(inventory.binding)) throw Error('A completed, source-bound clone recovery proof is required.');
  const { actionsSha256, ...payload } = materialized ?? {};
  if (!hash.test(actionsSha256 ?? '') || sha256(json(payload)) !== actionsSha256 ||
      materialized.format !== 'nestory-synthetic-reset-materialized-actions-v1' || materialized.syntheticOnly !== true ||
      materialized.customerApproval !== false || materialized.sourceBinding.manifestSha256 !== inventory.manifestSha256) {
    throw Error('Materialized exact action binding mismatch.');
  }
  if (['candidateHead', 'schemaSha256', 'migrationsSha256'].some(key => materialized.sourceBinding[key] !== inventory.binding[key]) ||
      json(materialized.sourceBinding.candidateSources) !== json(inventory.binding.candidateSources) ||
      json(materialized.sourceBinding.validatedSourceArtifacts) !== json(inventory.binding.fixtureArtifacts)) throw Error('Materialized source authority differs from the inventory.');
  if (!Array.isArray(executorSources) || executorSources.length !== EXECUTOR_SOURCE_FILES.length ||
      json(executorSources.map(item => item.name).sort()) !== json([...EXECUTOR_SOURCE_FILES].sort()) ||
      executorSources.some(item => !hash.test(item.sha256 ?? ''))) throw Error('Executor implementation binding is incomplete.');
}

export function assertFixedLocalEnvironment({ platform, env, actualProjectPath, actualRootPath }) {
  if (platform !== 'win32' || actualProjectPath !== projectRoot || actualRootPath !== root) throw Error('Executor requires the fixed, unredirected Windows local workspace.');
  for (const name of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'DATABASE_URL', 'SUPABASE_DB_CONTAINER']) {
    if (env[name]) throw Error('Executor refuses database target or credential overrides.');
  }
}

export function assertActionReadiness(materialized, mode) {
  if (['rehearseArchiveRestore', 'rehearseCheckedReset'].includes(mode) && materialized.syntheticOnly === true && materialized.customerApproval === false &&
      materialized.executionSupported === false && materialized.blockers.length === 1 &&
      materialized.blockers[0].code === 'known_zero_authority_unimplemented') {
    if (mode === 'rehearseCheckedReset' && !['20261024013615_financial_reset_known_zero_checked_phase.sql',
      '20261024013616_financial_reset_checked_continuation_billing.sql', '20261024013617_financial_reset_phase_recovery_sources.sql',
      '20261024013618_financial_reset_contract_recovery_guards.sql', '20261024013619_financial_reset_archived_property_known_zero.sql',
      '20261024013620_financial_reset_report_finalization_checkpoint.sql',
      '20261024013621_financial_reset_reviewed_deferred_leases_and_deposits.sql'].every(name =>
      materialized.sourceBinding?.validatedSourceArtifacts?.some(item => item.name === name && hash.test(item.sha256 ?? '')))) throw Error('Checked phase migration authority is absent.');
    return;
  }
  if (mode === 'fullReset' && materialized.executionSupported === true && materialized.blockers.length === 0) return;
  throw Error('Unsupported reset authority remains for this exact execution mode.');
}

// Only operation metadata, the reserved control and append-only revision stamps
// may differ outside the exact archived rows. Foreign organizations remain in
// every census, including these private tables.
export function untouchedCensusSql(tableEvidence, inventory, materialized) {
  const mutableMetadata = new Set(['financial_reset_operations', 'financial_reset_archive_rows', 'financial_reset_actions',
    'financial_reset_transaction_capabilities', 'financial_reset_zero_plans', 'financial_reset_continuation_plans',
    'financial_reset_phase_fences', 'financial_reset_zero_approvals', 'financial_reset_recovery_plans', 'financial_reset_recovery_sources', 'financial_reset_verification_checkpoints',
    'financial_write_controls', 'financial_report_source_revisions']);
  const catalog = new Map(inventory.tables.map(table => [table.table, table]));
  const statements = ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', "SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='60s';"];
  for (const item of tableEvidence) {
    const tableName = `${item.schema}.${item.name}`, table = `${identifier(item.schema)}.${identifier(item.name)}`;
    if (item.kind === 'sequence') {
      statements.push(`SELECT jsonb_build_object('kind','sequence','table',${literal(tableName)},'lastValue',last_value,'isCalled',is_called) FROM ${table};`);
      continue;
    }
    if (item.kind !== 'table') throw Error('Unknown census object.');
    const archived = materialized.archiveRows.filter(row => row.table === tableName);
    const exclusions = archived.map(row => {
      const pk = catalog.get(tableName)?.pk;
      if (!pk?.length || pk.length !== row.pk.length) throw Error('Missing exact archive primary key.');
      return `(${pk.map((column, index) => `to_jsonb(t)->${literal(column)}=${literal(JSON.stringify(row.pk[index]))}::jsonb`).join(' AND ')})`;
    });
    if (item.schema === 'app_private' && mutableMetadata.has(item.name)) exclusions.push(`to_jsonb(t)->>'organization_id'=${literal(TARGET.organization)}`);
    statements.push(`SELECT jsonb_build_object('kind','table','table',${literal(tableName)},'rows',count(*),
      'sha256',encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex'),''
      ORDER BY encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex')),''),'sha256'),'hex')) FROM ${table} t
      ${exclusions.length ? `WHERE NOT (${exclusions.join(' OR ')})` : ''};`);
  }
  return [...statements, 'COMMIT;'].join('\n');
}

export function foreignCensusSql(tableEvidence) {
  const queries = tableEvidence.filter(item => item.kind === 'table').map(item => {
    const table = `${identifier(item.schema)}.${identifier(item.name)}`;
    const scope = item.schema === 'public' && item.name === 'organizations' ? 'id' : 'organization_id';
    return `SELECT jsonb_build_object('table',${literal(`${item.schema}.${item.name}`)},'rows',count(*),'sha256',
      encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex'),''
      ORDER BY encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex')),''),'sha256'),'hex')) FROM ${table} t
      WHERE to_jsonb(t)->>${literal(scope)} IS DISTINCT FROM ${literal(TARGET.organization)};`;
  });
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL timezone='UTC'; ${queries.join('\n')} COMMIT;`;
}

// The ordinary invoice generator consumes this sequence once per new owner
// invoice (several lease fees can share one invoice). Never rewind it during
// recovery. All other counters and preserved rows must still match exactly.
export function checkedInvoiceSequenceEvidence(evidence, createdInvoices) {
  if (!Number.isSafeInteger(createdInvoices) || createdInvoices < 0) throw Error('Invalid generated owner invoice count.');
  const sequence = evidence.filter(row => row.kind === 'sequence' && row.table === 'public.owner_invoice_number_seq');
  if (sequence.length !== 1 || !Number.isSafeInteger(sequence[0].lastValue) || typeof sequence[0].isCalled !== 'boolean') {
    throw Error('Exact owner invoice sequence evidence is required.');
  }
  const current = sequence[0];
  const lastValue = current.lastValue + Math.max(0, createdInvoices - (current.isCalled ? 0 : 1));
  if (!Number.isSafeInteger(lastValue)) throw Error('Owner invoice sequence exceeds exact local evidence range.');
  return evidence.map(row => row === current ? { ...row, lastValue, isCalled: createdInvoices > 0 || current.isCalled } : row);
}

export function checkedBillingSummary(review, phases) {
  const deferred = review.continuation.leases.filter(lease => lease.disposition === 'defer-expired-unbilled');
  const actual = phases.continuationResult?.leases?.filter(lease => lease.disposition === 'defer-expired-unbilled');
  const billingComplete = deferred.length === 0;
  if (!Array.isArray(actual) || actual.length !== deferred.length ||
      new Set(actual.map(lease => lease.lease_id)).size !== actual.length ||
      [phases.continuationResult, phases.reportResult].some(result =>
        result?.billing_complete !== billingComplete || result?.deferred_lease_count !== deferred.length) ||
      phases.reportResult.reports_persisted !== true) throw Error('Persisted billing completeness does not match the reviewed deferred leases.');
  for (const lease of deferred) {
    const stored = actual.find(item => item.lease_id === lease.lease_id);
    if (!stored || Object.entries(lease).some(([key, value]) => json(stored[key]) !== json(value)) ||
        stored.invoice_id !== null || stored.generated_rent_amount !== 0 || stored.generated_fee_amount !== 0 ||
        stored.contract_changed !== false) throw Error('Persisted deferred lease changed its reviewed contract or created billing.');
  }
  return { reviewedLeaseDecisionsVerified: true, billingComplete, deferredUnbilledLeaseCount: deferred.length };
}

function compareCheckedCensus(before, after, createdInvoices, label) {
  const expected = checkedInvoiceSequenceEvidence(before, createdInvoices);
  try { return compareEvidence(expected, after, label); } catch (error) {
    const differingObjects = [...new Set([...expected, ...after].map(row => row.table))].filter(table =>
      json(expected.filter(row => row.table === table)) !== json(after.filter(row => row.table === table)));
    throw Error(`${error.message} Objects: ${differingObjects.join(', ')}.`, { cause: error });
  }
}

// Dollar-quoted SQL does not understand nested string literals. A row's notes
// may contain the preferred delimiter, so select it against the complete body.
// Deterministic output keeps review/intent digests stable across reconciliation.
export function sqlDoBlock(body, preferredTag) {
  if (typeof body !== 'string' || !/^[a-z][a-z0-9_]{0,40}$/.test(preferredTag ?? '')) throw Error('Invalid SQL block.');
  let tag = `$${preferredTag}$`, suffix = 0;
  while (body.includes(tag)) tag = `$${preferredTag}_${++suffix}$`;
  return `DO ${tag} ${body} ${tag};`;
}

export function buildActionTransactionSql(operationId, actions, faultAfterAction = null, checkedReview = null, finalizeRecovery = false) {
  if (typeof finalizeRecovery !== 'boolean' || (finalizeRecovery && checkedReview)) throw Error('Recovery finalization cannot be combined with reset phases.');
  if (!uuid.test(operationId ?? '') || !Array.isArray(actions) || !actions.length ||
      (faultAfterAction !== null && (!Number.isSafeInteger(faultAfterAction) || faultAfterAction < 1 || faultAfterAction > actions.length))) throw Error('Invalid action transaction.');
  const statements = ['BEGIN;', "SET LOCAL statement_timeout='60s'; SET LOCAL timezone='UTC';",
    `SELECT app_private.start_financial_reset_actions(${literal(operationId)}::uuid);`];
  if (checkedReview) {
    assertCheckedPhaseReview(checkedReview, { actionsSha256: checkedReview.actionsSha256,
      sourceBinding: { manifestSha256: checkedReview.manifestSha256 } });
    const claims = JSON.stringify({ sub: checkedReview.continuation.actor_id, role: 'authenticated' });
    statements.push(`SELECT set_config('request.jwt.claims',${literal(claims)},true),
      set_config('request.jwt.claim',${literal(claims)},true),set_config('request.jwt.claim.sub',${literal(checkedReview.continuation.actor_id)},true);`);
  }
  const seen = new Set();
  for (const [index, action] of actions.entries()) {
    if (!uuid.test(action.action_id ?? '') || seen.has(action.action_id) || action.ordinal !== index + 1 ||
        !['normalization', 'archive-delete', 'restore', 'recovery-prune', 'recovery-repair'].includes(action.kind) || !action.primary_key ||
        !Object.keys(action.primary_key).length || (action.before_row_text !== null && !hash.test(action.before_sha256 ?? ''))) throw Error('Unsealed or unsupported row action.');
    seen.add(action.action_id);
    const table = relation(action.relation_name);
    const pk = Object.keys(action.primary_key).map(column => `to_jsonb(t)->${literal(column)}=${literal(JSON.stringify(action.primary_key[column]))}::jsonb`).join(' AND ');
    const before = `${literal(action.before_row_text)}::jsonb`;
    let dml;
    if (action.kind === 'restore' && action.before_row_text === null) {
      if (action.before_sha256 !== null || !hash.test(action.after_sha256 ?? '') || !Array.isArray(action.insert_columns) ||
          !action.insert_columns.length || new Set(action.insert_columns).size !== action.insert_columns.length) throw Error('Restore INSERT lacks typed column authority.');
      const columns = action.insert_columns.map(identifier);
      dml = `INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(column => `r.${column}`).join(',')}
        FROM jsonb_populate_record(NULL::${table},${literal(action.after_row_text)}::jsonb) r;`;
    } else if (['archive-delete', 'recovery-prune'].includes(action.kind)) {
      if (action.after_row_text !== null || action.after_sha256 !== null) throw Error('Delete action has an after image.');
      dml = `DELETE FROM ${table} t WHERE ${pk} AND to_jsonb(t)=${before};`;
    } else {
      if (!hash.test(action.after_sha256 ?? '') || !Array.isArray(action.changed_columns) || !action.changed_columns.length ||
          new Set(action.changed_columns).size !== action.changed_columns.length ||
          action.changed_columns.some(column => Object.hasOwn(action.primary_key, column) || column === 'organization_id')) throw Error('Normalization lacks safe exact changed columns.');
      const after = `${literal(action.after_row_text)}::jsonb`;
      const setters = action.changed_columns.map(column => `${identifier(column)}=(jsonb_populate_record(NULL::${table},${after})).${identifier(column)}`).join(',');
      dml = `UPDATE ${table} t SET ${setters} WHERE ${pk} AND to_jsonb(t)=${before};`;
    }
    statements.push(`SELECT app_private.arm_financial_reset_action(${literal(operationId)}::uuid,${literal(action.action_id)}::uuid);`,
      sqlDoBlock(`DECLARE affected bigint; BEGIN ${dml} GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'Exact reset action row count mismatch'; END IF; END`, 'exact_row'));
    if (faultAfterAction === index + 1) statements.push("DO $fault$ BEGIN RAISE EXCEPTION 'Injected reset action rollback'; END $fault$;");
  }
  statements.push(`SELECT app_private.complete_financial_reset_actions(${literal(operationId)}::uuid);`);
  if (checkedReview) statements.push(
    `SELECT app_private.apply_financial_reset_known_zero(${literal(operationId)}::uuid);`,
    sqlDoBlock(`DECLARE reviewed jsonb; BEGIN
      reviewed:=${literal(JSON.stringify(checkedReview.continuation))}::jsonb||jsonb_build_object('source_sha256',
        app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(${literal(TARGET.organization)}::uuid)));
      PERFORM app_private.prepare_financial_reset_continuation(${literal(operationId)}::uuid,reviewed,app_private.financial_reset_hash(reviewed));
      PERFORM app_private.apply_financial_reset_continuation(${literal(operationId)}::uuid);
    END`, 'checked_continuation'),
    `SELECT app_private.apply_financial_reset_reports(${literal(operationId)}::uuid);`);
  if (finalizeRecovery) statements.push(`SELECT app_private.finalize_financial_reset_recovery(${literal(operationId)}::uuid);`);
  statements.push('COMMIT;');
  return statements.join('\n');
}

// Driver is deliberately a narrow command interface. Tests inject a fake driver;
// native use obtains one only from createFreshOwnedResetClone below.
export async function runBoundResetTransaction({ driver, operationId, planSha256, faultAfterAction = null, expectedCheckpointKind = null }) {
  if (expectedCheckpointKind !== null && !['checked-reports', 'phase-recovery'].includes(expectedCheckpointKind)) throw Error('Unknown checkpoint kind.');
  if (!uuid.test(operationId ?? '') || !hash.test(planSha256 ?? '') ||
      (faultAfterAction !== null && (!Number.isSafeInteger(faultAfterAction) || faultAfterAction < 1))) throw Error('Invalid immutable operation identity or fault point.');
  const status = async () => {
    const result = await driver.operationStatus(operationId);
    if (!result || result.operationId !== operationId || result.planSha256 !== planSha256 || result.frozen !== true) throw Error('Original operation status is missing or changed.');
    return result;
  };
  const before = await status();
  const completed = (value, extra = {}) => {
    if (expectedCheckpointKind !== null && (value.checkpointKind !== expectedCheckpointKind ||
        !hash.test(value.checkpointSha256 ?? '') || value.checkpointGenerationCurrent !== true)) throw Error('Completed actions lack the original durable verification checkpoint.');
    return { ...value, ...extra, actualResetRecoveryProven: false };
  };
  if (before.status === 'actions_complete') return completed(before, { replay: true });
  if (before.status !== 'sealed') throw Error('Reset operation is not sealed.');
  try {
    await driver.executeOperation(operationId, faultAfterAction);
  } catch (error) {
    // Never create a new operation after an ambiguous COMMIT. Read the original
    // UUID first; a rolled-back operation may be retried by the caller only with
    // this same identity and sealed plan. A live/unknown outcome stays blocked.
    const observed = await status();
    if (observed.status === 'actions_complete') return completed(observed, { commitAcknowledgementRecovered: true });
    if (observed.status === 'sealed') throw Error('Reset transaction rolled back; original operation remains sealed.', { cause: error });
    throw Error('Reset commit outcome remains unresolved; original operation must be inspected.', { cause: error });
  }
  const after = await status();
  if (after.status !== 'actions_complete') throw Error('Reset action sequence did not commit.');
  return completed(after);
}

// Export succeeds only after an exclusive write, fsync and exact read-back.
// Existing evidence is never overwritten, including a partial failed write.
export async function persistRehearsalEvidence(file, evidence) {
  const body = `${json(evidence)}\n`;
  let handle;
  try {
    handle = await open(file, 'wx');
    await handle.writeFile(body, 'utf8'); await handle.sync();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if ((await lstat(file)).isSymbolicLink() || await readFile(file, 'utf8') !== body) throw Error('Durable rehearsal evidence differs from the original record.');
    // Windows FlushFileBuffers requires a writable handle; r+ preserves bytes.
    handle = await open(file, 'r+'); await handle.sync();
  } finally { await handle?.close(); }
  if ((await lstat(file)).isSymbolicLink() || await readFile(file, 'utf8') !== body) throw Error('Durable rehearsal evidence differs from the original record.');
  return { path: file, sha256: sha256(body) };
}

export async function finishRehearsal({ clone, result, failure = null }) {
  const payload = failure ? { format: 'nestory-synthetic-reset-failure-v1', syntheticOnly: true, customerApproval: false,
    executionSupported: false, ...failure.rehearsalFailure } : result;
  let evidence;
  try { evidence = await clone.persistEvidence(failure ? 'failure-before-cleanup' : 'verified-before-cleanup', payload); }
  catch (error) {
    const stopped = Error('Rehearsal evidence could not be persisted; original clone and operation identities require inspection.', { cause: error });
    stopped.rehearsalFailure = { ...failure?.rehearsalFailure, clone: clone.identity, ...clone.operationIdentities(),
      evidencePersisted: false, cleanupAttempted: false, inspectionRequired: true };
    throw stopped;
  }
  if (failure) {
    failure.rehearsalFailure = { ...failure.rehearsalFailure, clone: clone.identity, ...clone.operationIdentities(), evidence,
      cleanupAttempted: false, cleanup: { cloneDropped: false, dumpRemoved: false, inspectionRequired: true } };
    throw failure;
  }
  try { await clone.cleanup(); }
  catch (error) {
    const stopped = failure ?? error;
    stopped.rehearsalFailure = { ...failure?.rehearsalFailure, clone: clone.identity, ...clone.operationIdentities(),
      evidence, cleanup: { cloneDropped: null, dumpRemoved: null, inspectionRequired: true } };
    throw stopped;
  }
  const completed = { ...result, evidence, cleanup: { cloneDropped: true, dumpRemoved: true } };
  const report = { ...completed, reportSha256: sha256(json(completed)) };
  let reportFile;
  try { reportFile = await clone.persistEvidence('report', report); }
  catch (error) {
    const stopped = Error('Final report write failed; the verified pre-cleanup evidence remains available.', { cause: error });
    stopped.rehearsalFailure = { clone: clone.identity, ...clone.operationIdentities(), evidence,
      cleanup: completed.cleanup, finalReportPersisted: false, inspectionRequired: true };
    throw stopped;
  }
  return { ...report, reportFile };
}

export function boundedCommandFailure(error, stderr = '') {
  const sqlstate = /ERROR:\s+([A-Z0-9]{5}):/.exec(stderr)?.[1];
  const constraint = /^CONSTRAINT NAME:\s+([a-z][a-z0-9_]{0,127})\s*$/m.exec(stderr)?.[1];
  const guard = /ERROR:\s+[A-Z0-9]{5}:\s+(financial_reset_[a-z0-9_]+)\b/.exec(stderr)?.[1];
  const contexts = [...stderr.matchAll(/PL\/pgSQL function ([a-z][a-z0-9_.]*)\([^\r\n)]*\) line ([0-9]+) at/g)]
    .slice(0, 5).map(match => `${match[1]}:${match[2]}`);
  const processCode = /^[A-Z][A-Z0-9_]{0,31}$/.test(error?.code ?? '') ? error.code : null;
  return Error(`Bounded local command failed${sqlstate ? `; SQLSTATE ${sqlstate}` : ''}${constraint ? `; constraint ${constraint}` : ''}${guard ? `; guard ${guard}` : ''}${contexts.length ? `; functions ${contexts.join(', ')}` : ''}${processCode ? `; process ${processCode}` : ''}. SQL and row payloads withheld.`);
}

const nativeExecute = (file, args, input, { timeoutMs = 60_000, env = process.env } = {}) => new Promise((resolve, reject) => {
  const child = execFile(file, args, { cwd: root, env, timeout: timeoutMs, windowsHide: true, shell: false, maxBuffer: 64 * 1024 ** 2 },
    (error, stdout, stderr) => error ? reject(boundedCommandFailure(error, stderr)) : resolve(stdout));
  child.stdin.on('error', () => {}); child.stdin.end(input ?? '');
});

export async function createFreshOwnedResetClone({ inventory, recoveryProof, materialized, executorSources, mode = 'fullReset', phaseReview = null }) {
  // Retain private copies: a caller cannot swap the reviewed plan while an
  // asynchronous clone/freeze operation is waiting for the local database.
  inventory = structuredClone(inventory); recoveryProof = structuredClone(recoveryProof);
  materialized = structuredClone(materialized); executorSources = structuredClone(executorSources);
  phaseReview = structuredClone(phaseReview);
  assertResetPrerequisites({ inventory, recoveryProof, materialized, executorSources });
  assertActionReadiness(materialized, mode);
  if (mode === 'rehearseCheckedReset') assertCheckedPhaseReview(phaseReview, materialized);
  else if (phaseReview !== null) throw Error('Checked phase review cannot be attached to another execution mode.');
  assertFixedLocalEnvironment({ platform: process.platform, env: process.env,
    actualProjectPath: await realpath(projectRoot), actualRootPath: await realpath(root) });
  const binding = inventory.binding, runId = randomUUID(), identity = cloneIdentity(runId);
  const evidenceDirectory = path.join(evidenceRoot, runId);
  let checkedDirectory = path.resolve(root, '..');
  for (const component of path.relative(checkedDirectory, evidenceDirectory).split(path.sep)) {
    checkedDirectory = path.join(checkedDirectory, component);
    await mkdir(checkedDirectory).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(checkedDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(checkedDirectory) !== checkedDirectory) throw Error('Rehearsal evidence directory is redirected.');
  }
  const persistEvidence = async (stage, evidence) => {
    if (!/^[a-z][a-z-]{0,40}$/.test(stage)) throw Error('Invalid evidence stage.');
    return persistRehearsalEvidence(path.join(evidenceDirectory, `${stage}.json`), evidence);
  };
  await persistEvidence('identity', { format: 'nestory-synthetic-reset-identity-v1', mode, operationId: runId, clone: identity,
    syntheticOnly: true, customerApproval: false, executionSupported: false, manifestSha256: inventory.manifestSha256,
    actionsSha256: materialized.actionsSha256, candidateHead: binding.candidateHead, executorSources });
  const { docker, endpoint } = await localRecoveryDocker({ execute: nativeExecute });
  if (endpoint !== binding.endpoint) throw Error('Captured Docker endpoint changed.');
  const sourceId = binding.containerId;
  const inspect = async () => {
    const result = JSON.parse(await docker(['inspect', TARGET.container, '--format', '{"name":{{json .Name}},"id":{{json .Id}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"image":{{json .Image}}}']));
    assertSourceContainer(result, sourceId);
    if (result.image !== binding.image) throw Error('Captured database image changed.');
    return result;
  };
  const sql = (database, body) => docker(['exec', '-i', sourceId, 'psql', '-X', '-qAt', '-U',
    database === identity.database ? 'postgres' : 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], body);
  const rows = async (database, body) => parseJsonLines(await sql(database, body));
  const record = async () => (await rows(TARGET.database, `BEGIN READ ONLY; SELECT jsonb_build_object('name',datname,'oid',oid::bigint,'owner',pg_get_userbyid(datdba),'comment',shobj_description(oid,'pg_database')) FROM pg_database WHERE datname=${literal(identity.database)}; COMMIT;`))[0];
  const assertOwned = async () => { await inspect(); assertOwnedClone(identity, await record()); };
  const census = async database => {
    const result = { tables: await rows(database, tableCensusSql), schema: await rows(database, schemaCensusSql) };
    assertUniqueObjectKeys(result.schema); return result;
  };
  const checkFiles = async () => {
    if ((await nativeExecute('git', ['rev-parse', 'HEAD'])).trim() !== binding.candidateHead) throw Error('Candidate HEAD changed.');
    for (const item of [...binding.candidateSources, ...executorSources]) {
      if (!/^(scripts\/)[a-zA-Z0-9_.-]+$/.test(item.name) ||
          sha256(normalizedSource(await readFile(path.join(root, item.name), 'utf8'))) !== item.sha256) throw Error('Bound executor or source implementation changed.');
    }
    const names = (await readdir(path.join(root, 'supabase/migrations'))).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
    const migrations = await Promise.all(names.map(async name => ({ name, sha256: sha256(normalizedSource(await readFile(path.join(root, 'supabase/migrations', name), 'utf8'))) })));
    if (sha256(json(migrations)) !== binding.migrationsSha256) throw Error('Migration file binding changed.');
    return names;
  };
  const names = await checkFiles(); await nativeExecute('git', ['merge-base', '--is-ancestor', TARGET.baseSha, 'HEAD']);
  const config = await readFile(path.join(projectRoot, 'supabase/config.toml'), 'utf8');
  const fixtureSha256 = sha256(await readFile(path.join(root, 'supabase/test-fixtures/baseline.sql')));
  const source = await inspect(); assertLocalContainer({ config, inspect: source, baseSha: TARGET.baseSha, fixtureSha256 });
  assertLocalSource({ config, inspect: source, baseSha: TARGET.baseSha, fixtureSha256,
    identities: (await rows(TARGET.database, `BEGIN READ ONLY; ${identitySql} COMMIT;`))[0] });
  const ledger = await rows(TARGET.database, `BEGIN READ ONLY; SELECT jsonb_build_object('version',m.version,'name',m.name,'statements',coalesce((SELECT jsonb_agg(jsonb_build_object('byteLength',octet_length(replace(s.statement,E'\\r\\n',E'\\n')),'sha256',encode(extensions.digest(replace(s.statement,E'\\r\\n',E'\\n'),'sha256'),'hex')) ORDER BY s.ordinality) FROM unnest(m.statements) WITH ORDINALITY s(statement,ordinality)),'[]'::jsonb)) FROM supabase_migrations.schema_migrations m ORDER BY m.version; COMMIT;`);
  if (ledger.length !== names.length) throw Error('Source migration ledger count differs.');
  for (let index = 0; index < names.length; index++) {
    const name = names[index], entry = ledger[index];
    if (entry.version !== name.slice(0, 14) || entry.name !== name.slice(15, -4) ||
        reconstructLocalMigrationDescriptors(normalizedSource(await readFile(path.join(root, 'supabase/migrations', name), 'utf8')), entry.statements).issue) throw Error('Installed migration function/schema authority differs.');
  }
  const before = await census(TARGET.database);
  // Match the inventory's binary lexical schema sorting exactly.
  const boundSchemaHash = sha256(json([...before.schema].sort((a, b) => json(a) < json(b) ? -1 : json(a) > json(b) ? 1 : 0)));
  if (boundSchemaHash !== binding.schemaSha256) throw Error('Source schema/function/ACL binding changed.');
  assertManifestRows(inventory, before.tables);
  const free = (await docker(['exec', sourceId, 'df', '-Pk', '/var/lib/postgresql/data'])).trim().split(/\r?\n/).at(-1).trim().split(/\s+/);
  assertDiskSpace(Number(free[3]) * 1024);
  let created = false, dumpAttempted = false;
  const sourceUnchanged = async () => {
    await inspect(); await checkFiles(); const after = await census(TARGET.database);
    compareEvidence(before.tables, after.tables, 'Source data and sequences unchanged');
    compareEvidence(before.schema, after.schema, 'Source schema/functions/ACLs unchanged');
    return true;
  };
  const cleanup = async () => {
    if (created) { await assertOwned(); await docker(['exec', sourceId, 'dropdb', '-U', 'supabase_admin', identity.database]); if (await record()) throw Error('Owned clone remains.'); created = false; }
    if (dumpAttempted) { await inspect(); await docker(['exec', sourceId, 'rm', '-f', '--', identity.dumpPath]); dumpAttempted = false; }
    await sourceUnchanged();
  };
  try {
    await inspect(); dumpAttempted = true;
    await docker(['exec', sourceId, 'pg_dump', '-U', 'supabase_admin', '-d', TARGET.database, '--format=custom', `--file=${identity.dumpPath}`,
      '--exclude-extension=pg_cron', '--exclude-schema=cron', '--exclude-extension=pg_net', '--exclude-schema=net'], undefined, { timeoutMs: 120_000 });
    const dump = { sha256: (await docker(['exec', sourceId, 'sha256sum', identity.dumpPath])).split(/\s/)[0],
      bytes: Number((await docker(['exec', sourceId, 'stat', '-c', '%s', identity.dumpPath])).trim()) };
    assertDump(dump);
    await sourceUnchanged(); if (await record()) throw Error('Generated clone already exists.');
    // The only commands sent to the source connection outside READ ONLY are
    // CREATE/COMMENT DATABASE for this fresh random clone, never financial DML.
    await sql(TARGET.database, `CREATE DATABASE "${identity.database}" OWNER postgres TEMPLATE template0;`);
    created = true;
    await sql(TARGET.database, `COMMENT ON DATABASE "${identity.database}" IS ${literal(identity.marker)};`);
    identity.oid = (await record())?.oid; await assertOwned();
    await persistEvidence('clone-created', { operationId: runId, clone: identity, dump });
    await docker(['exec', sourceId, 'pg_restore', '-U', 'supabase_admin', '-d', identity.database,
      '--exit-on-error', '--single-transaction', '--clean', '--if-exists', identity.dumpPath], undefined, { timeoutMs: 120_000 });
    const clone = await census(identity.database);
    compareEvidence(before.tables, clone.tables, 'Fresh clone data'); compareEvidence(before.schema, clone.schema, 'Fresh clone schema/functions/ACLs');
    await sourceUnchanged();
    let reservation = null, sealedActions = null, resetArchive = null, resetArchiveDigest = null;
    let restoreReservation = null, restorePlan = null, restoreActions = null;
    let phaseRecovery = null, retainedPhaseHistory = null, createdOwnerInvoices = null;
    const untouchedSql = untouchedCensusSql(before.tables, inventory, materialized);
    const untouchedBefore = await rows(identity.database, untouchedSql);
    const checkedPhaseTables = new Set(['public.owner_opening_balance_requests', 'public.owner_opening_balance_entries',
      'public.lease_terms', 'public.lease_billing_terms', 'public.finance_income_items', 'public.tenant_invoices',
      'public.tenant_invoice_lines', 'public.tenant_invoice_rent_segments', 'public.management_fee_occurrences',
      'public.owner_invoices', 'public.owner_invoice_lines', 'public.activity_logs', 'public.rent_generation_exceptions',
      'app_private.financial_idempotency_requests', 'public.owner_event_allocation_sets', 'public.owner_event_owner_allocations',
      'public.owner_component_movements', 'public.owner_balance_periods', 'public.owner_balance_period_components']);
    const checkedUntouchedSql = untouchedCensusSql(before.tables.filter(item => !checkedPhaseTables.has(`${item.schema}.${item.name}`)), inventory, materialized);
    const checkedUntouchedBefore = mode === 'rehearseCheckedReset' ? await rows(identity.database, checkedUntouchedSql) : null;
    const foreignSql = foreignCensusSql(before.tables);
    const foreignBefore = mode === 'rehearseCheckedReset' ? await rows(identity.database, foreignSql) : null;
    const historyTables = new Set(['public.activity_logs', 'app_private.financial_idempotency_requests']);
    const restoredUntouchedSql = untouchedCensusSql(before.tables.filter(item => !historyTables.has(`${item.schema}.${item.name}`)), inventory, materialized);
    const restoredUntouchedBefore = mode === 'rehearseCheckedReset' ? await rows(identity.database, restoredUntouchedSql) : null;
    const cloneWrite = async body => { await assertOwned(); await sourceUnchanged(); return sql(identity.database, body); };
    const operationStatus = async operationId => {
      if (operationId !== runId && operationId !== restoreReservation?.operationId) throw Error('Only the original clone operation UUID may be inspected.');
      await assertOwned();
      return (await rows(identity.database, `BEGIN READ ONLY; WITH state AS (SELECT app_private.financial_reset_operation_status(${literal(operationId)}::uuid) AS s)
        SELECT jsonb_build_object('operationId',s->>'operation_id','planSha256',s->>'plan_sha256','status',s->>'status',
          'checkpointKind',s->>'checkpoint_kind','checkpointSha256',s->>'checkpoint_sha256',
          'checkpointGenerationCurrent',s->'checkpoint_generation_current',
          'targetGeneration',(s->>'target_generation')::integer,'frozen',EXISTS(SELECT 1 FROM app_private.financial_write_controls
            WHERE organization_id=${literal(TARGET.organization)}::uuid AND status='frozen' AND generation=(s->>'target_generation')::integer)) FROM state; COMMIT;`))[0];
    };
    const freeze = async () => {
      if (reservation) throw Error('This clone already has an immutable freeze reservation.');
      assertActionReadiness(materialized, mode);
      await assertOwned(); const current = await census(identity.database);
      compareEvidence(before.tables, current.tables, 'Clone before first frozen transaction');
      compareEvidence(before.schema, current.schema, 'Clone schema before first frozen transaction');
      const rules = await rows(identity.database, `BEGIN READ ONLY; SET LOCAL search_path=pg_catalog;
        SELECT jsonb_build_object('name',r.relation_name,'resolved',c.oid IS NOT NULL,
          'oidCurrent',NOT (to_jsonb(r)?'relation_oid') OR (to_jsonb(r)->>'relation_oid')::oid=c.oid,
          'gates', (SELECT count(*)=2 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgenabled='O'
            AND t.tgname IN ('000_financial_reset_row_action','zzzz_financial_reset_row_action_complete')),
          'generated',r.generated_columns=(SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname),'{}')
            FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated<>''))
        FROM app_private.financial_reset_relation_rules r LEFT JOIN pg_class c ON c.oid=to_regclass(r.relation_name)
        ORDER BY r.relation_name; COMMIT;`);
      const archivedRelations = new Set(materialized.archiveRows.map(row => row.table));
      if (!rules.length || rules.some(rule => !rule.resolved || !rule.oidCurrent || !rule.generated ||
          (materialized.actions.some(action => action.table === rule.name && (action.kind === 'archive-remove' || action.changedColumns.length)) && !rule.gates)) ||
          [...archivedRelations].some(name => !rules.some(rule => rule.name === name))) throw Error('Clone foundation relation identity or row gates are invalid.');
      const sourceGeneration = Number((await sql(identity.database, `BEGIN READ ONLY; SELECT coalesce((SELECT generation FROM app_private.financial_write_controls WHERE organization_id=${literal(TARGET.organization)}::uuid),0); COMMIT;`)).trim());
      if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 0 || sourceGeneration >= 2147483647) throw Error('Invalid source generation.');
      reservation = Object.freeze({ operationId: runId, sourceGeneration, targetGeneration: sourceGeneration + 1 });
      // The source boundary is immutable in memory before sending this commit;
      // a lost response never advances the generation a second time.
      try {
        await cloneWrite(`BEGIN; SET LOCAL statement_timeout='60s';
          SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||${literal(TARGET.organization)},0));
          DO $freeze$ BEGIN
            IF coalesce((SELECT generation FROM app_private.financial_write_controls WHERE organization_id=${literal(TARGET.organization)}::uuid),0)<>${sourceGeneration} THEN RAISE EXCEPTION 'Clone source generation changed'; END IF;
            IF ${sourceGeneration}=0 THEN
              INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
              VALUES(${literal(TARGET.organization)}::uuid,${reservation.targetGeneration},'frozen',${literal(TARGET.cutoff)}::date);
            ELSE
              UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=${literal(TARGET.organization)}::uuid;
              UPDATE app_private.financial_write_controls SET generation=${reservation.targetGeneration},financial_start_date=${literal(TARGET.cutoff)}::date WHERE organization_id=${literal(TARGET.organization)}::uuid;
            END IF;
          END $freeze$; COMMIT;`);
      } catch {
        const state = (await rows(identity.database, `BEGIN READ ONLY; SELECT jsonb_build_object('generation',generation,'status',status,'cutoff',financial_start_date) FROM app_private.financial_write_controls WHERE organization_id=${literal(TARGET.organization)}::uuid; COMMIT;`))[0];
        if (state?.generation !== reservation.targetGeneration || state.status !== 'frozen' || state.cutoff !== TARGET.cutoff) throw Error('Freeze outcome unresolved; inspect the original clone and operation UUID.');
      }
      return reservation;
    };
    const prepare = async () => {
      if (!reservation) throw Error('Committed freeze reservation must precede preparation.');
      if (sealedActions) throw Error('Operation is already sealed; inspect its original UUID.');
      assertActionReadiness(materialized, mode);
      await assertOwned();
      const tableCatalog = new Map(inventory.tables.map(table => [table.table, table]));
      const archive = materialized.archiveRows.map(row => {
        const table = tableCatalog.get(row.table);
        if (!table || row.pk.length !== table.pk.length || sha256(row.rowText) !== row.sha256) throw Error('Archive identity mismatch.');
        return { relation_name: row.table, primary_key: Object.fromEntries(table.pk.map((column, index) => [column, row.pk[index]])), row_text: row.rowText, row_sha256: row.sha256 };
      });
      resetArchive = archive;
      const candidates = materialized.actions.filter(action => action.kind === 'archive-remove' || action.changedColumns.length);
      // PostgreSQL alone supplies canonical typed hashes. No numeric JSON round
      // trip through JavaScript is used for complete before/after row images.
      const queries = candidates.map(action => {
        const table = relation(action.table);
        const beforeText = action.requiredCurrentRowText ?? action.beforeRowText;
        const afterExpression = action.allowedAfterRowText === null ? 'NULL::jsonb' : `to_jsonb(jsonb_populate_record(NULL::${table},${literal(action.allowedAfterRowText)}::jsonb))`;
        return `WITH typed AS (SELECT
          to_jsonb(jsonb_populate_record(NULL::${table},${literal(beforeText)}::jsonb)) AS b,${afterExpression} AS a)
          SELECT jsonb_build_object('before_row_text',b::text,'after_row_text',a::text,
            'before_sha256',encode(extensions.digest(b::text,'sha256'),'hex'),
            'after_sha256',CASE WHEN a IS NULL THEN NULL ELSE encode(extensions.digest(a::text,'sha256'),'hex') END) FROM typed;`;
      });
      const canonicalRows = await rows(identity.database, `BEGIN READ ONLY; SET LOCAL timezone='UTC'; ${queries.join('\n')} COMMIT;`);
      if (canonicalRows.length !== candidates.length) throw Error('Typed reset image count mismatch.');
      const typed = candidates.map((action, index) => ({ action_id: randomUUID(), ordinal: index + 1, relation_name: action.table,
        primary_key: Object.fromEntries(tableCatalog.get(action.table).pk.map((column, position) => [column, action.pk[position]])),
        kind: action.kind === 'archive-remove' ? 'archive-delete' : 'normalization', ...canonicalRows[index], changed_columns: action.changedColumns }));
      if (!typed.length) throw Error('Reset has no supported exact row actions.');
      const digests = (await rows(identity.database, `BEGIN READ ONLY; SELECT jsonb_build_object(
        'archive',encode(extensions.digest((SELECT coalesce(jsonb_agg(jsonb_build_object('relation_name',r->'relation_name','primary_key',r->'primary_key','row_sha256',r->'row_sha256') ORDER BY r->>'relation_name',(r->'primary_key')::text),'[]'::jsonb)::text FROM jsonb_array_elements(${literal(JSON.stringify(archive))}::jsonb) r),'sha256'),'hex'),
        'actions',encode(extensions.digest((SELECT coalesce(jsonb_agg(jsonb_build_object('action_id',r->'action_id','ordinal',r->'ordinal','relation_name',r->'relation_name','primary_key',r->'primary_key','kind',r->'kind','before_sha256',r->'before_sha256','after_sha256',r->'after_sha256') ORDER BY (r->>'ordinal')::integer),'[]'::jsonb)::text FROM jsonb_array_elements(${literal(JSON.stringify(typed))}::jsonb) r),'sha256'),'hex'),
        'auditTimestamp',clock_timestamp()); COMMIT;`))[0];
      const operation = { operation_id: runId, organization_id: TARGET.organization, operation_kind: 'reset',
        source_generation: reservation.sourceGeneration, target_generation: reservation.targetGeneration,
        manifest_sha256: inventory.manifestSha256, plan_sha256: materialized.actionsSha256, schema_sha256: binding.schemaSha256,
        archive_sha256: digests.archive, action_sha256: digests.actions, archive_count: archive.length, action_count: typed.length,
        audit_timestamp: digests.auditTimestamp, audit_actor: null, restore_of: null };
      resetArchiveDigest = digests.archive;
      // Keep exactly these IDs/images on unknown preparation COMMIT outcomes.
      sealedActions = typed;
      const zeroPlan = phaseReview ? { operation_id: runId, organization_id: TARGET.organization,
        manifest_sha256: inventory.manifestSha256, reset_plan_sha256: materialized.actionsSha256,
        maker_actor_id: phaseReview.zero.makerActorId, reviewer_actor_id: phaseReview.zero.reviewerActorId,
        effective_date: phaseReview.zero.effectiveDate, currencies: phaseReview.zero.currencies, scopes: phaseReview.zero.scopes } : null;
      const prepareZeroSql = zeroPlan ? `SELECT app_private.prepare_financial_reset_zero_plan(${literal(runId)}::uuid,
        ${literal(JSON.stringify(zeroPlan))}::jsonb,app_private.financial_reset_hash(${literal(JSON.stringify(zeroPlan))}::jsonb));` : '';
      try {
        await cloneWrite(`BEGIN;
          SELECT app_private.prepare_financial_reset_operation(${literal(JSON.stringify(operation))}::jsonb);
          SELECT app_private.archive_financial_reset_rows(${literal(runId)}::uuid,${literal(JSON.stringify(archive))}::jsonb);
          SELECT app_private.prepare_financial_reset_actions(${literal(runId)}::uuid,${literal(JSON.stringify(typed))}::jsonb);
          SELECT app_private.seal_financial_reset_operation(${literal(runId)}::uuid);
          ${prepareZeroSql} COMMIT;`);
      } catch {
        const state = await operationStatus(runId);
        if (state?.status !== 'sealed' || state.planSha256 !== materialized.actionsSha256 || state.frozen !== true) throw Error('Preparation outcome unresolved; inspect original operation UUID before retry.');
      }
      return { operationId: runId, planSha256: materialized.actionsSha256, actionCount: typed.length, archiveCount: archive.length,
        expectedCheckpointKind: mode === 'rehearseCheckedReset' ? 'checked-reports' : null };
    };
    const executeOperation = async (operationId, faultAfterAction = null) => {
      const actions = operationId === runId ? sealedActions : operationId === restoreReservation?.operationId ? restoreActions : null;
      if (!actions) throw Error('Only an original prepared operation may execute.');
      await cloneWrite(buildActionTransactionSql(operationId, actions, faultAfterAction, operationId === runId ? phaseReview : null,
        mode === 'rehearseCheckedReset' && operationId === restoreReservation?.operationId));
      await sourceUnchanged();
    };
    const approveSyntheticZeroPlan = async () => {
      if (mode !== 'rehearseCheckedReset' || !phaseReview || !sealedActions) throw Error('Fixture approval requires the prepared synthetic checked mode.');
      const planDigest = (await sql(identity.database, `BEGIN READ ONLY; SELECT review_sha256 FROM app_private.financial_reset_zero_plans
        WHERE operation_id=${literal(runId)}::uuid AND status='prepared'; COMMIT;`)).trim();
      if (!hash.test(planDigest)) throw Error('Prepared zero plan digest is missing.');
      // Local fixture role sessions exercise the real approval RPC. These are
      // synthetic test approvals, never evidence of customer/human approval.
      for (const actor of [phaseReview.zero.makerActorId, phaseReview.zero.reviewerActorId]) {
        const claims = JSON.stringify({ sub: actor, role: 'authenticated' });
        try {
          await cloneWrite(`BEGIN; SET LOCAL ROLE authenticated;
            SELECT set_config('request.jwt.claims',${literal(claims)},true),set_config('request.jwt.claim',${literal(claims)},true),
              set_config('request.jwt.claim.sub',${literal(actor)},true);
            SELECT public.approve_financial_reset_zero_plan(${literal(runId)}::uuid,${literal(planDigest)}); COMMIT;`);
        } catch {
          const count = Number((await sql(identity.database, `BEGIN READ ONLY; SELECT count(*) FROM app_private.financial_reset_zero_approvals
            WHERE operation_id=${literal(runId)}::uuid AND review_sha256=${literal(planDigest)} AND approved_by=${literal(actor)}::uuid; COMMIT;`)).trim());
          if (count !== 1) throw Error('Synthetic approval RPC failed; original plan remains unapproved.');
        }
      }
      const count = Number((await sql(identity.database, `BEGIN READ ONLY; SELECT count(*) FROM app_private.financial_reset_zero_approvals
        WHERE operation_id=${literal(runId)}::uuid AND review_sha256=${literal(planDigest)}; COMMIT;`)).trim());
      if (count !== 2) throw Error('Both independent fixture-role approvals are required.');
      return { syntheticFixtureApprovals: true, customerApproval: false, approvalCount: count, zeroPlanReviewSha256: planDigest };
    };
    const verifyRows = async (phase, verifyUntouched = true) => {
      if (!['removed', 'restored'].includes(phase) || !resetArchive ||
          (phase === 'restored' && !restoreActions)) throw Error('Row verification phase is not prepared.');
      const applicable = phase === 'restored' ? [...sealedActions, ...restoreActions] : sealedActions;
      const expected = new Map(resetArchive.map(row => [json([row.relation_name, row.primary_key]), row.row_text]));
      for (const action of applicable) expected.set(json([action.relation_name, action.primary_key]), action.after_row_text);
      const checks = resetArchive.map((row, index) => {
        const table = relation(row.relation_name), value = expected.get(json([row.relation_name, row.primary_key]));
        const pk = Object.entries(row.primary_key).map(([column, key]) => `to_jsonb(t)->${literal(column)}=${literal(JSON.stringify(key))}::jsonb`).join(' AND ');
        return `SELECT jsonb_build_object('ordinal',${index + 1},'passed',${value === null ? 'count(*)=0' :
          `count(*)=1 AND coalesce(bool_and(to_jsonb(t)=${literal(value)}::jsonb),false)`},
          'rowSha256',min(encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex'))) FROM ${table} t WHERE ${pk};`;
      });
      await assertOwned();
      const verified = await rows(identity.database, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL timezone='UTC';
        ${checks.join('\n')} COMMIT;`);
      if (verified.length !== resetArchive.length || verified.some(row => row.passed !== true)) throw Error(`Exact archived row ${phase} verification failed.`);
      if (verifyUntouched) compareEvidence(untouchedBefore, await rows(identity.database, untouchedSql), 'Untouched rows, foreign organizations and sequences');
      const schema = await rows(identity.database, schemaCensusSql);
      compareEvidence(before.schema, schema, 'Clone schema/functions/ACLs after row actions');
      const opId = phase === 'restored' ? restoreReservation.operationId : runId;
      const status = await operationStatus(opId);
      if (status.status !== 'actions_complete' || status.frozen !== true) throw Error('Verified rows require a completed operation and frozen control.');
      await sourceUnchanged();
      return { phase, rowCount: verified.length, storedRowsSha256: sha256(json(verified)),
        untouchedRowsUnchanged: verifyUntouched, sourceUnchanged: true, frozen: true, operationId: opId };
    };
    const captureRecoverySources = async () => {
      const captured = (await rows(identity.database, `BEGIN READ ONLY; SET LOCAL timezone='UTC'; WITH candidates AS (
        SELECT app_private.financial_reset_recovery_candidates(${literal(runId)}::uuid) AS value)
        SELECT jsonb_build_object('binding',jsonb_build_object('schema_sha256',${literal(binding.schemaSha256)},
          'zero_review_sha256',z.review_sha256,'zero_authority_sha256',z.result_json->>'authority_sha256',
          'continuation_review_sha256',c.review_sha256,'continuation_before_sha256',c.result_json->>'before_sha256',
          'continuation_after_sha256',c.result_json->>'after_sha256',
          'report_checkpoint_sha256',r.checkpoint_sha256,
          'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(z.organization_id)),
          'sources_sha256',app_private.financial_reset_hash(candidates.value)),
          'sources',(SELECT jsonb_agg((s-ARRAY['before_row','after_row'])||jsonb_build_object(
            'before_row_text',(s->'before_row')::text,'after_row_text',nullif(s->'after_row','null'::jsonb)::text,
            'changed_columns',CASE WHEN s->>'kind'='recovery-prune' THEN '[]'::jsonb ELSE
              (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(s->'before_row') k WHERE s->'before_row'->k IS DISTINCT FROM s->'after_row'->k) END)
            ORDER BY s->>'relation_name',(s->'primary_key')::text) FROM jsonb_array_elements(candidates.value) s))
        FROM candidates,app_private.financial_reset_zero_plans z JOIN app_private.financial_reset_continuation_plans c USING(operation_id,organization_id)
          JOIN app_private.financial_reset_verification_checkpoints r USING(operation_id,organization_id)
        WHERE z.operation_id=${literal(runId)}::uuid; COMMIT;`))[0];
      if (!captured?.sources?.length) throw Error('Phase-derived recovery sources are absent.');
      const targetNames = [...new Set(captured.sources.filter(source => source.kind === 'recovery-prune').map(source => source.relation_name))];
      const foreignKeys = await rows(identity.database, `BEGIN READ ONLY; SELECT jsonb_build_object('name',fk.conname,
        'source',ns.nspname||'.'||cs.relname,'target',nt.nspname||'.'||ct.relname,'validated',fk.convalidated,
        'columns',(SELECT jsonb_agg(a.attname ORDER BY k.ordinality) FROM unnest(fk.conkey) WITH ORDINALITY k(attnum,ordinality)
          JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.attnum),
        'targetColumns',(SELECT jsonb_agg(a.attname ORDER BY k.ordinality) FROM unnest(fk.confkey) WITH ORDINALITY k(attnum,ordinality)
          JOIN pg_attribute a ON a.attrelid=fk.confrelid AND a.attnum=k.attnum))
        FROM pg_constraint fk JOIN pg_class cs ON cs.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=cs.relnamespace
        JOIN pg_class ct ON ct.oid=fk.confrelid JOIN pg_namespace nt ON nt.oid=ct.relnamespace
        WHERE fk.contype='f' AND nt.nspname||'.'||ct.relname IN (${targetNames.map(literal).join(',')}) ORDER BY fk.oid; COMMIT;`);
      const queries = foreignKeys.map(fk => {
        if (!fk.validated || !fk.columns.length || fk.columns.length !== fk.targetColumns.length) throw Error('Recovery incoming FK catalog is unsupported.');
        const child = fk.source.split('.').map(identifier).join('.'), parent = fk.target.split('.').map(identifier).join('.');
        return `WITH sources AS (SELECT value s FROM jsonb_array_elements(app_private.financial_reset_recovery_candidates(${literal(runId)}::uuid)))
          SELECT jsonb_build_object('constraint',${literal(fk.name)},'source',(SELECT jsonb_build_object('relation_name',s->'relation_name','primary_key',s->'primary_key')
            FROM sources WHERE s->>'relation_name'=${literal(fk.source)} AND s->'before_row'=to_jsonb(c)),
            'target',jsonb_build_object('relation_name',x.s->'relation_name','primary_key',x.s->'primary_key'))
          FROM ${child} c JOIN ${parent} p ON ${fk.columns.map((column, i) => `c.${identifier(column)}=p.${identifier(fk.targetColumns[i])}`).join(' AND ')}
          JOIN sources x ON x.s->>'relation_name'=${literal(fk.target)} AND x.s->>'kind'='recovery-prune' AND x.s->'before_row'=to_jsonb(p);`;
      });
      const edges = queries.length ? await rows(identity.database, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ${queries.join('\n')} COMMIT;`) : [];
      return { binding: captured.binding, sources: orderRecoverySources(captured.sources, edges), incomingEdges: edges };
    };
    const prepareRestore = async () => {
      if (!['rehearseArchiveRestore', 'rehearseCheckedReset'].includes(mode) || restoreReservation) throw Error('Restore requires this rehearsal and its original unused reservation.');
      if (mode === 'rehearseCheckedReset') {
        if (!['20261024013617_financial_reset_phase_recovery_sources.sql', '20261024013618_financial_reset_contract_recovery_guards.sql'].every(name =>
          materialized.sourceBinding.validatedSourceArtifacts.some(item => item.name === name && hash.test(item.sha256 ?? '')))) throw Error('Phase-derived recovery authority is not bound.');
        await verifyCheckedPhases(); phaseRecovery = await captureRecoverySources();
        retainedPhaseHistory = (await census(identity.database)).tables.filter(item => historyTables.has(`${item.schema}.${item.name}`));
      } else await verifyRows('removed');
      if (reservation.targetGeneration >= 2147483647) throw Error('Restore generation exhausted.');
      restoreReservation = Object.freeze({ operationId: randomUUID(), sourceGeneration: reservation.targetGeneration,
        targetGeneration: reservation.targetGeneration + 1 });
      await persistEvidence('restore-reservation', { originalResetOperationId: runId, restore: restoreReservation, clone: identity });
      restorePlan = materializeRestoreActions(materialized, restoreReservation.targetGeneration);
      if (phaseRecovery) {
        const payload = { ...restorePlan }; delete payload.restorePlanSha256;
        const catalog = new Map(inventory.tables.map(table => [table.table, table]));
        payload.phaseBinding = phaseRecovery.binding;
        payload.actions = [...phaseRecovery.sources.map(source => ({ table: source.relation_name,
          pk: catalog.get(source.relation_name).pk.map(column => source.primary_key[column]), kind: source.kind,
          beforeRowText: source.before_row_text, allowedAfterRowText: source.after_row_text, changedColumns: source.changed_columns,
          expectedStoredAfterSha256: source.after_sha256 })), ...payload.actions];
        restorePlan = { ...payload, restorePlanSha256: sha256(json(payload)) };
      }
      // Restore reserves a new generation in its own committed transaction. Old
      // request seals, registrations and cancelled delivery intent stay retired.
      try {
        await cloneWrite(`BEGIN; SET LOCAL statement_timeout='60s';
          SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||${literal(TARGET.organization)},0));
          DO $restore_generation$ BEGIN
            IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=${literal(TARGET.organization)}::uuid
              AND generation=${restoreReservation.sourceGeneration} AND status='frozen') THEN RAISE EXCEPTION 'Restore source generation changed'; END IF;
            UPDATE app_private.financial_write_controls SET generation=${restoreReservation.targetGeneration}
              WHERE organization_id=${literal(TARGET.organization)}::uuid;
          END $restore_generation$; COMMIT;`);
      } catch {
        const state = (await rows(identity.database, `BEGIN READ ONLY; SELECT jsonb_build_object('generation',generation,'status',status)
          FROM app_private.financial_write_controls WHERE organization_id=${literal(TARGET.organization)}::uuid; COMMIT;`))[0];
        if (state?.generation !== restoreReservation.targetGeneration || state.status !== 'frozen') throw Error('Restore reservation outcome unresolved; retain its original UUID.');
      }
      const catalog = new Map(inventory.tables.map(table => [table.table, table]));
      const queries = restorePlan.actions.map(action => {
        const table = relation(action.table), beforeExpression = action.beforeRowText === null ? 'NULL::jsonb' :
          `to_jsonb(jsonb_populate_record(NULL::${table},${literal(action.beforeRowText)}::jsonb))`;
        const afterExpression = action.allowedAfterRowText === null ? 'NULL::jsonb' :
          `to_jsonb(jsonb_populate_record(NULL::${table},${literal(action.allowedAfterRowText)}::jsonb))`;
        return `WITH typed AS (SELECT
          ${beforeExpression} AS b,${afterExpression} AS a)
          SELECT jsonb_build_object('before_row_text',b::text,'after_row_text',a::text,
            'before_sha256',CASE WHEN b IS NULL THEN NULL ELSE encode(extensions.digest(b::text,'sha256'),'hex') END,
            'after_sha256',encode(extensions.digest(a::text,'sha256'),'hex'),
            'insert_columns',(SELECT jsonb_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid=${literal(action.table)}::regclass
              AND attnum>0 AND NOT attisdropped AND attgenerated='')) FROM typed;`;
      });
      const canonicalRows = await rows(identity.database, `BEGIN READ ONLY; SET LOCAL timezone='UTC'; ${queries.join('\n')} COMMIT;`);
      if (canonicalRows.length !== restorePlan.actions.length) throw Error('Typed restore image count mismatch.');
      const typed = restorePlan.actions.map((action, index) => ({ action_id: randomUUID(), ordinal: index + 1, relation_name: action.table,
        primary_key: Object.fromEntries(catalog.get(action.table).pk.map((column, position) => [column, action.pk[position]])),
        kind: action.kind, ...canonicalRows[index], changed_columns: action.changedColumns }));
      if (!typed.length) throw Error('Archive contains no supported restore actions.');
      const digest = (await rows(identity.database, `BEGIN READ ONLY; SELECT jsonb_build_object('sha256',encode(extensions.digest(
        (SELECT jsonb_agg(jsonb_build_object('action_id',r->'action_id','ordinal',r->'ordinal','relation_name',r->'relation_name',
          'primary_key',r->'primary_key','kind',r->'kind','before_sha256',r->'before_sha256','after_sha256',r->'after_sha256')
          ORDER BY (r->>'ordinal')::integer)::text FROM jsonb_array_elements(${literal(JSON.stringify(typed))}::jsonb) r),'sha256'),'hex'),
          'auditTimestamp',clock_timestamp()); COMMIT;`))[0];
      const operation = { operation_id: restoreReservation.operationId, organization_id: TARGET.organization, operation_kind: 'restore',
        source_generation: restoreReservation.sourceGeneration, target_generation: restoreReservation.targetGeneration,
        manifest_sha256: inventory.manifestSha256, plan_sha256: restorePlan.restorePlanSha256, schema_sha256: binding.schemaSha256,
        archive_sha256: resetArchiveDigest, archive_count: resetArchive.length, action_sha256: digest.sha256, action_count: typed.length,
        audit_timestamp: digest.auditTimestamp, audit_actor: null, restore_of: runId };
      restoreActions = typed;
      try {
        await cloneWrite(`BEGIN;
          SELECT app_private.prepare_financial_reset_operation(${literal(JSON.stringify(operation))}::jsonb);
          ${phaseRecovery ? `SELECT app_private.prepare_financial_reset_recovery(${literal(restoreReservation.operationId)}::uuid,${literal(JSON.stringify(phaseRecovery.binding))}::jsonb);` : ''}
          SELECT app_private.prepare_financial_reset_actions(${literal(restoreReservation.operationId)}::uuid,${literal(JSON.stringify(typed))}::jsonb);
          SELECT app_private.seal_financial_reset_operation(${literal(restoreReservation.operationId)}::uuid); COMMIT;`);
      } catch {
        const state = await operationStatus(restoreReservation.operationId);
        if (state?.status !== 'sealed' || state.planSha256 !== restorePlan.restorePlanSha256 || state.frozen !== true) throw Error('Restore preparation outcome unresolved; inspect original restore UUID.');
      }
      return { operationId: restoreReservation.operationId, planSha256: restorePlan.restorePlanSha256,
        actionCount: typed.length, archiveCount: resetArchive.length, targetGeneration: restoreReservation.targetGeneration,
        expectedCheckpointKind: mode === 'rehearseCheckedReset' ? 'phase-recovery' : null };
    };
    const verifyCheckedPhases = async () => {
      if (mode !== 'rehearseCheckedReset' || !phaseReview) throw Error('Checked phase verification requires its explicit reviewed mode.');
      const archive = await verifyRows('removed', false);
      const result = (await rows(identity.database, `BEGIN READ ONLY; SET LOCAL timezone='UTC';
        SELECT jsonb_build_object('zeroComplete',z.status='complete','continuationComplete',c.status='complete',
          'sameResetTransaction',z.execution_backend=o.execution_backend AND z.execution_xid=o.execution_xid
            AND r.execution_backend=o.execution_backend AND r.execution_xid=o.execution_xid,
          'semanticPlanMatches',(c.plan_json-'source_sha256')=${literal(JSON.stringify(phaseReview.continuation))}::jsonb,
          'zeroScopeMatches',z.plan_json->'scopes'=${literal(JSON.stringify(phaseReview.zero.scopes))}::jsonb
            AND z.plan_json->>'maker_actor_id'=${literal(phaseReview.zero.makerActorId)} AND z.plan_json->>'reviewer_actor_id'=${literal(phaseReview.zero.reviewerActorId)},
          'phaseFenceCount',(SELECT count(*) FROM app_private.financial_reset_phase_fences f WHERE f.operation_id=o.operation_id),
          'currentSnapshotMatches',r.after_images=app_private.financial_reset_continuation_snapshot(o.organization_id),
          'reportCheckpointMatches',r.checkpoint_kind='checked-reports' AND r.generation=o.target_generation
            AND r.checkpoint_sha256=app_private.financial_reset_hash(r.result_json) AND r.before_images=c.after_images,
          'reportCheckpointSha256',r.checkpoint_sha256,'reportResult',r.result_json,
          'createdOwnerInvoices',(SELECT count(*) FROM jsonb_array_elements(c.after_images->'public.owner_invoices') a
            WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_images->'public.owner_invoices') b WHERE b->>'id'=a->>'id')),
          'createdOwnerInvoiceNumbers',(SELECT coalesce(jsonb_agg(a->>'invoice_number' ORDER BY a->>'invoice_number'),'[]')
            FROM jsonb_array_elements(c.after_images->'public.owner_invoices') a WHERE NOT EXISTS(
              SELECT 1 FROM jsonb_array_elements(c.before_images->'public.owner_invoices') b WHERE b->>'id'=a->>'id')),
          'zeroAuthoritySha256',z.result_json->>'authority_sha256','zeroScopeCount',z.result_json->'scope_count',
          'zeroComponentCount',z.result_json->'component_count','zeroReviewSha256',z.review_sha256,
          'continuationReviewSha256',c.review_sha256,'continuationSourceSha256',c.plan_json->>'source_sha256',
          'continuationResult',c.result_json,'frozen',EXISTS(SELECT 1 FROM app_private.financial_write_controls w
            WHERE w.organization_id=o.organization_id AND w.generation=o.target_generation AND w.status='frozen' AND w.financial_start_date=${literal(TARGET.cutoff)}::date))
        FROM app_private.financial_reset_operations o JOIN app_private.financial_reset_zero_plans z USING(operation_id,organization_id)
          JOIN app_private.financial_reset_continuation_plans c USING(operation_id,organization_id)
          JOIN app_private.financial_reset_verification_checkpoints r USING(operation_id,organization_id)
        WHERE o.operation_id=${literal(runId)}::uuid; COMMIT;`))[0];
      if (!result || ['zeroComplete', 'continuationComplete', 'sameResetTransaction', 'semanticPlanMatches', 'zeroScopeMatches', 'currentSnapshotMatches', 'reportCheckpointMatches', 'frozen'].some(key => result[key] !== true) ||
          result.phaseFenceCount !== 3 || !hash.test(result.reportCheckpointSha256 ?? '') || result.zeroScopeCount !== phaseReview.zero.scopes.length ||
          result.zeroComponentCount !== phaseReview.zero.scopes.length * 4 || !hash.test(result.zeroAuthoritySha256 ?? '')) throw Error('Checked phase postconditions did not persist exactly.');
      compareCheckedCensus(checkedUntouchedBefore, await rows(identity.database, checkedUntouchedSql), result.createdOwnerInvoices, 'Checked phase preserved tables and sequences');
      const invoiceSequence = checkedUntouchedBefore.find(row => row.table === 'public.owner_invoice_number_seq');
      const invoiceNumbers = Array.from({ length: result.createdOwnerInvoices }, (_, index) => {
        const value = invoiceSequence.lastValue + index + (invoiceSequence.isCalled ? 1 : 0);
        if (value < 1 || value > 999999) throw Error('Owner invoice number exceeds the fixed local rehearsal range.');
        return `OWN-${TARGET.cutoff.slice(0, 7).replace('-', '')}-${String(value).padStart(6, '0')}`;
      });
      if (json(invoiceNumbers.sort()) !== json(result.createdOwnerInvoiceNumbers)) throw Error('Generated owner invoice numbers do not match exact sequence consumption.');
      createdOwnerInvoices = result.createdOwnerInvoices;
      const billing = checkedBillingSummary(phaseReview, result);
      compareEvidence(foreignBefore, await rows(identity.database, foreignSql), 'Checked phase all foreign and unscoped rows');
      await sourceUnchanged();
      return { ...result, ...billing, archivedRowsVerified: archive.rowCount, semanticReviewSha256: phaseReview.reviewSha256,
        sourceUnchanged: true, preservedTablesUnchanged: true, foreignRowsUnchanged: true,
        knownZeroVerified: true, continuationBillingVerified: true, reportsPersisted: true, actualResetRecoveryProven: false };
    };
    const verifyPhaseRecovery = async () => {
      if (mode !== 'rehearseCheckedReset' || !phaseRecovery || !retainedPhaseHistory || !restoreReservation) throw Error('Phase recovery is not prepared.');
      const restored = await verifyRows('restored', false);
      const queries = phaseRecovery.sources.map((source, index) => {
        const table = relation(source.relation_name);
        const pk = Object.entries(source.primary_key).map(([column, value]) => `to_jsonb(t)->${literal(column)}=${literal(JSON.stringify(value))}::jsonb`).join(' AND ');
        return `SELECT jsonb_build_object('ordinal',${index + 1},'passed',${source.kind === 'recovery-prune' ? 'count(*)=0' :
          `count(*)=1 AND coalesce(bool_and(encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex')=${literal(source.after_sha256)}),false)`})
          FROM ${table} t WHERE ${pk};`;
      });
      const verified = await rows(identity.database, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL timezone='UTC'; ${queries.join('\n')} COMMIT;`);
      if (verified.length !== phaseRecovery.sources.length || verified.some(row => row.passed !== true)) throw Error('Generated authority prune or predecessor repair was not exact.');
      const after = await census(identity.database);
      compareEvidence(retainedPhaseHistory, after.tables.filter(item => historyTables.has(`${item.schema}.${item.name}`)), 'Completed phase audit and idempotency history unchanged');
      compareCheckedCensus(restoredUntouchedBefore, await rows(identity.database, restoredUntouchedSql), createdOwnerInvoices, 'Restored masters and all other untouched rows');
      compareEvidence(foreignBefore, await rows(identity.database, foreignSql), 'Restored foreign and unscoped rows');
      const currentRequests = Number((await sql(identity.database, `BEGIN READ ONLY; SELECT count(*) FROM app_private.financial_idempotency_requests
        WHERE organization_id=${literal(TARGET.organization)}::uuid AND financial_generation>=${restoreReservation.targetGeneration}; COMMIT;`)).trim());
      if (currentRequests !== 0) throw Error('Old phase intent regained current-generation authority.');
      const checkpoint = (await rows(identity.database, `BEGIN READ ONLY; SELECT jsonb_build_object('kind',checkpoint_kind,
        'sha256',checkpoint_sha256,'matches',checkpoint_sha256=app_private.financial_reset_hash(result_json)
          AND generation=${restoreReservation.targetGeneration} AND after_images=app_private.financial_reset_continuation_snapshot(organization_id),
        'reportCheckpointSha256',result_json->>'report_checkpoint_sha256')
        FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${literal(restoreReservation.operationId)}::uuid; COMMIT;`))[0];
      if (checkpoint?.kind !== 'phase-recovery' || checkpoint.matches !== true || !hash.test(checkpoint.sha256 ?? '') ||
          checkpoint.reportCheckpointSha256 !== phaseRecovery.binding.report_checkpoint_sha256) throw Error('Durable phase recovery checkpoint is absent or changed.');
      await sourceUnchanged();
      return { originalArchive: restored, phaseSourceCount: verified.length,
        phaseSourcesVerifiedSha256: sha256(json(verified)), phaseBinding: phaseRecovery.binding,
        retainedPhaseHistoryUnchanged: true, phaseIntentRetired: true, mastersAndUntouchedRowsRestored: true,
        foreignRowsUnchanged: true, sourceUnchanged: true, frozen: true, targetGeneration: restoreReservation.targetGeneration,
        recoveryCheckpoint: checkpoint, actualResetRecoveryProven: true };
    };
    return Object.freeze({ identity: Object.freeze({ ...identity }), dump: Object.freeze(dump),
      operationId: runId, assertOwned, sourceUnchanged, cleanup, freeze, prepare, operationStatus, executeOperation, persistEvidence,
      prepareRestore, verifyRows, verifyCheckedPhases, approveSyntheticZeroPlan, verifyPhaseRecovery,
      operationIdentities() { return { reset: runId, restore: restoreReservation?.operationId ?? null }; },
      async inspectClone() { await assertOwned(); return census(identity.database); },
    });
  } catch (error) {
    error.clonePreparationFailure = { clone: { ...identity }, originalOperationId: runId, created, dumpAttempted };
    try { await cleanup(); error.clonePreparationFailure.cleanupComplete = true; }
    catch { error.clonePreparationFailure.cleanupComplete = false; error.clonePreparationFailure.inspectionRequired = true; }
    throw error;
  }
}

export async function rehearseArchiveRestore(options) {
  options = structuredClone(options);
  assertActionReadiness(options.materialized, 'rehearseArchiveRestore');
  const clone = await createFreshOwnedResetClone({ ...options, mode: 'rehearseArchiveRestore' });
  let result, phase = 'freeze', reset, restore, failure, rollbackProof = null;
  try {
    const frozen = await clone.freeze(); phase = 'prepare-reset'; reset = await clone.prepare();
    if (options.faultAfterAction !== undefined) {
      if (!Number.isSafeInteger(options.faultAfterAction) || options.faultAfterAction < 1 || options.faultAfterAction > reset.actionCount) throw Error('Invalid rehearsal rollback action.');
      phase = 'injected-reset-rollback';
      const beforeFault = await clone.inspectClone();
      let rejected = false;
      try { await runBoundResetTransaction({ driver: clone, ...reset, faultAfterAction: options.faultAfterAction }); }
      catch (error) { if (error.message !== 'Reset transaction rolled back; original operation remains sealed.') throw error; rejected = true; }
      if (!rejected) throw Error('Injected rollback unexpectedly committed.');
      const afterFault = await clone.inspectClone();
      compareEvidence(beforeFault.tables, afterFault.tables, 'Injected rollback full clone rows and sequences');
      compareEvidence(beforeFault.schema, afterFault.schema, 'Injected rollback full clone schema');
      rollbackProof = { verified: true, faultAfterAction: options.faultAfterAction, operationId: reset.operationId, retriedSameOperation: true };
    }
    phase = 'execute-reset';
    await runBoundResetTransaction({ driver: clone, ...reset });
    phase = 'verify-removal';
    const removal = await clone.verifyRows('removed');
    phase = 'prepare-restore'; restore = await clone.prepareRestore();
    phase = 'execute-restore';
    await runBoundResetTransaction({ driver: clone, ...restore });
    phase = 'verify-restoration';
    const restored = await clone.verifyRows('restored');
    result = { format: 'nestory-synthetic-frozen-archive-restore-rehearsal-v1', syntheticOnly: true,
      customerApproval: false, executionSupported: false, knownZeroVerified: false, actualResetRecoveryProven: false,
      archiveRestoreRehearsalVerified: true, controlReopened: false, manifestSha256: options.inventory.manifestSha256,
      actionsSha256: options.materialized.actionsSha256, clone: clone.identity, frozen, reset, rollbackProof, removal, restore, restored };
  } catch (error) {
    failure = error;
    const states = [];
    const identities = clone.operationIdentities();
    for (const operationId of new Set(Object.values(identities).filter(Boolean))) {
      try { states.push(await clone.operationStatus(operationId)); }
      catch { states.push({ operationId, status: 'unreachable' }); }
    }
    failure.rehearsalFailure = { phase, clone: clone.identity, originalResetOperationId: clone.operationId,
      originalRestoreOperationId: identities.restore, operationStatesBeforeCleanup: states,
      archiveRestoreRehearsalVerified: false, knownZeroVerified: false, sourceUnchanged: false };
    try { await clone.sourceUnchanged(); failure.rehearsalFailure.sourceUnchanged = true; } catch { /* Evidence remains false. */ }
  }
  return finishRehearsal({ clone, result, failure });
}

// Checked commands produce new authority. The separately bound phase recovery
// extension prunes only their exact generated rows and repairs their observed
// predecessor-term changes before restoring the original immutable archive.
export async function rehearseCheckedReset(options) {
  options = structuredClone(options);
  assertActionReadiness(options.materialized, 'rehearseCheckedReset');
  assertCheckedPhaseReview(options.phaseReview, options.materialized);
  const clone = await createFreshOwnedResetClone({ ...options, mode: 'rehearseCheckedReset' });
  let result, failure, phase = 'freeze';
  try {
    const frozen = await clone.freeze(); phase = 'prepare-reset-and-zero';
    const reset = await clone.prepare();
    phase = 'synthetic-independent-approval-rpcs';
    const approvals = await clone.approveSyntheticZeroPlan();
    let rollbackProof = null;
    if (options.faultAfterAction !== undefined) {
      if (!Number.isSafeInteger(options.faultAfterAction) || options.faultAfterAction < 1 || options.faultAfterAction > reset.actionCount) throw Error('Invalid checked rehearsal fault point.');
      phase = 'injected-checked-reset-rollback';
      const beforeFault = await clone.inspectClone(); let rejected = false;
      try { await runBoundResetTransaction({ driver: clone, ...reset, faultAfterAction: options.faultAfterAction }); }
      catch (error) { if (error.message !== 'Reset transaction rolled back; original operation remains sealed.') throw error; rejected = true; }
      if (!rejected) throw Error('Injected checked reset unexpectedly committed.');
      const afterFault = await clone.inspectClone();
      compareEvidence(beforeFault.tables, afterFault.tables, 'Checked reset rollback full rows and sequences');
      compareEvidence(beforeFault.schema, afterFault.schema, 'Checked reset rollback schema');
      rollbackProof = { verified: true, faultAfterAction: options.faultAfterAction, originalOperationId: reset.operationId };
    }
    phase = 'atomic-reset-known-zero-continuation';
    const commit = await runBoundResetTransaction({ driver: clone, ...reset });
    phase = 'verify-checked-phases';
    const phases = await clone.verifyCheckedPhases();
    phase = 'prepare-phase-derived-recovery';
    const restore = await clone.prepareRestore();
    let restoreRollbackProof = null;
    if (options.faultAfterRestoreAction !== undefined) {
      if (!Number.isSafeInteger(options.faultAfterRestoreAction) || options.faultAfterRestoreAction < 1 || options.faultAfterRestoreAction > restore.actionCount) throw Error('Invalid recovery rollback fault point.');
      phase = 'injected-phase-recovery-rollback'; const beforeFault = await clone.inspectClone(); let rejected = false;
      try { await runBoundResetTransaction({ driver: clone, ...restore, faultAfterAction: options.faultAfterRestoreAction }); }
      catch (error) { if (error.message !== 'Reset transaction rolled back; original operation remains sealed.') throw error; rejected = true; }
      if (!rejected) throw Error('Injected phase recovery unexpectedly committed.');
      const afterFault = await clone.inspectClone();
      compareEvidence(beforeFault.tables, afterFault.tables, 'Phase recovery rollback full rows and sequences');
      compareEvidence(beforeFault.schema, afterFault.schema, 'Phase recovery rollback schema');
      restoreRollbackProof = { verified: true, faultAfterAction: options.faultAfterRestoreAction, originalOperationId: restore.operationId };
    }
    phase = 'execute-phase-derived-recovery';
    await runBoundResetTransaction({ driver: clone, ...restore });
    phase = 'verify-phase-derived-recovery';
    const recovery = await clone.verifyPhaseRecovery();
    result = { format: 'nestory-synthetic-checked-reset-rehearsal-v1', syntheticOnly: true, customerApproval: false,
      executionSupported: false, knownZeroPhaseVerified: true, continuationBillingVerified: true, reportsPersisted: phases.reportsPersisted,
      reviewedLeaseDecisionsVerified: phases.reviewedLeaseDecisionsVerified, billingComplete: phases.billingComplete,
      deferredUnbilledLeaseCount: phases.deferredUnbilledLeaseCount,
      actualResetRecoveryProven: recovery.actualResetRecoveryProven,
      finalState: 'original-finance-restored-with-retired-phase-history', controlReopenedAfterCommit: false,
      manifestSha256: options.inventory.manifestSha256, actionsSha256: options.materialized.actionsSha256,
      semanticReviewSha256: options.phaseReview.reviewSha256, clone: clone.identity, frozen, reset, approvals, rollbackProof, commit, phases,
      restore, restoreRollbackProof, recovery };
  } catch (error) {
    failure = error; const identities = clone.operationIdentities(), states = [];
    for (const operationId of Object.values(identities).filter(Boolean)) {
      try { states.push(await clone.operationStatus(operationId)); } catch { states.push({ operationId, status: 'unreachable' }); }
    }
    failure.rehearsalFailure = { phase, clone: clone.identity, originalResetOperationId: clone.operationId,
      originalRestoreOperationId: identities.restore, operationStatesBeforeCleanup: states, knownZeroVerified: false, actualResetRecoveryProven: false };
  }
  return finishRehearsal({ clone, result, failure });
}
