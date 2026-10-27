// Fixed protected-runner policy. The CLI supplies concrete OS/GitHub/provider
// observations; these pure checks are also exercised with isolated fixtures.
import path from 'node:path';
import { assertOperatorPacket, canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { assertNoBackupPacket, NO_BACKUP_POLICY, NO_BACKUP_EVIDENCE_ROLES } from './pilot-finance-reset-no-backup-core.mjs';
import { timestampMicros, digestDatabaseJson } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { ACTOR_SOURCE_FILES } from './pilot-finance-reset-hosted-actor.mjs';
import { validateNoBackupCompletionHistory, validateNoBackupReopeningAudit, validateNoBackupReopeningAuthority }
  from './pilot-finance-reset-reopening-protocol.mjs';

export const RESET_REPOSITORY = 'soley-bot/nestory';
export const RESET_PROJECT = 'pfvmztxktkwyewvxfgot';
export const RESET_ORGANIZATION = '752a87b8-bd04-4a45-9cb8-00687af66e73';
export const RESET_WORKFLOW_PATH = '.github/workflows/pilot-financial-reset.yml';
export const RESET_CONFIGURATION_PATH = '/etc/nestory-reset/runner.json';
export const RESET_PERSISTENT_ROOT = '/var/lib/nestory-reset';
// Complete local import graph of the fixed runner, including transitive helpers.
// The contract test walks actual imports so a new helper cannot escape pinning.
export const HOSTED_RUNTIME_SOURCE_FILES = Object.freeze([
  RESET_WORKFLOW_PATH, 'scripts/pilot-finance-reset-hosted-reconcile.mjs',
  ...['hosted-runner', 'hosted-workflow-core', 'hosted-actor', 'hosted-transport', 'hosted-transport-protocol',
    'hosted-protocol', 'single-admin-policy', 'operator-core', 'durable-store', 'encrypted-artifacts', 'external-store', 'recovery-artifact-reader',
    'executor-local', 'executor-plan', 'retired-journal-core', 'no-backup-core', 'no-backup-runtime', 'no-backup-transport',
    'no-backup-reader', 'current-session', 'reopening-protocol', 'migration-parity',
    'core', 'recovery-core', 'registry'].map(name => `scripts/pilot-finance-reset-${name}.mjs`),
  'scripts/local-recovery-docker.mjs', 'scripts/ips-readiness-recovery-core.mjs', 'scripts/hosted-migration-parity-core.mjs',
]);
// Runtime imports and actor/transport SQL contracts are separate rosters. Both
// must be pinned before reading private artifact/provider configuration.
export const HOSTED_BOUND_SOURCE_FILES = Object.freeze([...new Set([...HOSTED_RUNTIME_SOURCE_FILES, ...ACTOR_SOURCE_FILES,
  'package.json', 'package-lock.json'])].sort());
export const RESET_ACTIONS = Object.freeze(['inspect', 'reconcile', 'freeze', 'checkpoint', 'prepare', 'seal', 'execute', 'prepare-recovery', 'execute-recovery', 'reopen', 'complete-receipt']);
const actions = RESET_ACTIONS.filter(action => !['inspect', 'reconcile'].includes(action));
const legacyActions = actions.filter(action => !['reopen', 'complete-receipt'].includes(action));
const digest = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{40}$/;
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  canonicalJson(Object.keys(value).sort()) === canonicalJson([...fields].sort());
const fail = code => { throw new Error(code); };
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
export const isNoBackupWorkflow = configuration => configuration?.format === 'nestory-protected-reset-runner-v2';
export const NO_BACKUP_RUNTIME_INPUT_ROLES = Object.freeze(['manifest', 'actions', 'archive', 'zeroPlan', 'continuationPlan', 'reportPlan', 'postgresSemantic']);
const forwardActions = ['freeze', 'checkpoint', 'prepare', 'seal', 'execute'];
const noBackupActions = [...forwardActions, 'reopen'];
export const RESET_CURRENT_SESSION_PATH = '/etc/nestory-reset/current-session.json';

export function parseHostedWorkflowArguments(args) {
  if (!Array.isArray(args) || args.length !== 14) fail('hosted_workflow_arguments_invalid');
  const names = ['action', 'operation-id', 'packet-sha256', 'descriptors-sha256', 'authority-sha256', 'authorization-id', 'reconcile-action'];
  const result = {};
  for (let index = 0; index < names.length; index++) {
    if (args[index * 2] !== `--${names[index]}` || typeof args[index * 2 + 1] !== 'string') fail('hosted_workflow_arguments_invalid');
    result[names[index]] = args[index * 2 + 1];
  }
  if (!RESET_ACTIONS.includes(result.action) || !uuid.test(result['operation-id']) ||
    !['packet-sha256', 'descriptors-sha256', 'authority-sha256'].every(name => digest.test(result[name])) ||
    (actions.includes(result.action) && !['reopen', 'complete-receipt'].includes(result.action) ? !uuid.test(result['authorization-id']) : result['authorization-id'] !== 'none') ||
    (['reconcile', 'complete-receipt'].includes(result.action) ?
      ![...legacyActions, 'reopen'].includes(result['reconcile-action']) : result['reconcile-action'] !== 'none')) fail('hosted_workflow_arguments_invalid');
  return Object.freeze(result);
}

function absolutePath(value) {
  return typeof value === 'string' && /^\/[A-Za-z0-9_./-]+$/.test(value) && path.posix.normalize(value) === value &&
    !value.split('/').some(part => part === '.' || part === '..');
}

export function assertHostedConfiguration(configuration, expectedDigest, bytes) {
  if (isNoBackupWorkflow(configuration)) return assertNoBackupConfiguration(configuration, expectedDigest, bytes);
  if (!digest.test(expectedDigest) || hashBytes(bytes) !== expectedDigest || !exact(configuration, [
    'format', 'repository', 'projectRef', 'organizationId', 'runnerId', 'persistentRoot', 'mountSourceSha256', 'mountFilesystem',
    'journalStoreId', 'artifactStoreId', 'keyId', 'connection', 'psqlBinarySha256', 'sslRootCertSha256', 'provisioningSha256', 'operations',
  ]) || configuration.format !== 'nestory-protected-reset-runner-v1' || configuration.repository !== RESET_REPOSITORY ||
    configuration.projectRef !== RESET_PROJECT || configuration.organizationId !== RESET_ORGANIZATION ||
    !Number.isSafeInteger(configuration.runnerId) || configuration.runnerId < 1 || configuration.persistentRoot !== RESET_PERSISTENT_ROOT ||
    !digest.test(configuration.mountSourceSha256) || !['ext4', 'xfs', 'btrfs'].includes(configuration.mountFilesystem) ||
    !uuid.test(configuration.journalStoreId) || !uuid.test(configuration.artifactStoreId) || configuration.journalStoreId === configuration.artifactStoreId ||
    typeof configuration.keyId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(configuration.keyId) ||
    !['provisioningSha256', 'psqlBinarySha256', 'sslRootCertSha256'].every(name => digest.test(configuration[name]))) fail('hosted_workflow_configuration_invalid');
  const connection = configuration.connection;
  if (!exact(connection, ['expectedProjectRef', 'host', 'port', 'database', 'user', 'psqlPath', 'sslRootCertPath', 'passwordFilePath']) ||
    connection.expectedProjectRef !== RESET_PROJECT || connection.host !== `db.${RESET_PROJECT}.supabase.co` || connection.port !== 5432 ||
    connection.database !== 'postgres' || !/^[a-z_][a-z0-9_]{0,62}$/.test(connection.user) ||
    !/^\/(?:usr\/bin|usr\/lib\/postgresql\/[1-9][0-9]*\/bin)\/psql$/.test(connection.psqlPath) || connection.sslRootCertPath !== '/etc/nestory-reset/database-ca.pem' ||
    connection.passwordFilePath !== '/etc/nestory-reset/database.pgpass') fail('hosted_workflow_connection_invalid');
  if (!Array.isArray(configuration.operations) || configuration.operations.length !== 1) fail('hosted_workflow_operation_enrollment_invalid');
  for (const operation of configuration.operations) {
    const fields = ['operationId', 'packetSha256', 'descriptorsSha256', 'authoritySha256', 'mainSha', 'actions'];
    const optional = ['recovery', 'reconciliation'].filter(name => Object.hasOwn(operation, name));
    if (!exact(operation, [...fields, ...optional]) ||
      !uuid.test(operation.operationId) || !['packetSha256', 'descriptorsSha256', 'authoritySha256'].every(name => digest.test(operation[name])) ||
      !sha.test(operation.mainSha) || !Array.isArray(operation.actions) || !operation.actions.length ||
      new Set(operation.actions).size !== operation.actions.length || operation.actions.some(action => !legacyActions.includes(action))) fail('hosted_workflow_operation_enrollment_invalid');
    if (operation.recovery !== undefined && (!exact(operation.recovery, ['operationId', 'expectedSha256', 'descriptorSha256', 'authoritySha256']) ||
      !uuid.test(operation.recovery.operationId) || operation.recovery.operationId === operation.operationId ||
      !['expectedSha256', 'descriptorSha256', 'authoritySha256'].every(name => digest.test(operation.recovery[name])))) fail('hosted_workflow_recovery_enrollment_invalid');
    if (operation.reconciliation !== undefined && (!exact(operation.reconciliation, ['authoritySha256']) ||
      !digest.test(operation.reconciliation.authoritySha256))) fail('hosted_workflow_read_enrollment_invalid');
  }
  return configuration;
}

function assertNoBackupConfiguration(c, expectedDigest, bytes) {
  if (!digest.test(expectedDigest) || hashBytes(bytes) !== expectedDigest || !exact(c, ['format', 'recoveryPolicy', 'repository', 'projectRef',
    'organizationId', 'runnerId', 'persistentRoot', 'mountSourceSha256', 'mountFilesystem', 'journalStoreId', 'connection',
    'psqlBinarySha256', 'sslRootCertSha256', 'provisioningSha256', 'operations']) || c.recoveryPolicy !== NO_BACKUP_POLICY ||
    c.repository !== RESET_REPOSITORY || c.projectRef !== RESET_PROJECT || c.organizationId !== RESET_ORGANIZATION ||
    !Number.isSafeInteger(c.runnerId) || c.runnerId < 1 || c.persistentRoot !== RESET_PERSISTENT_ROOT || !uuid.test(c.journalStoreId) ||
    !['mountSourceSha256', 'psqlBinarySha256', 'sslRootCertSha256', 'provisioningSha256'].every(k => digest.test(c[k])) ||
    !['ext4', 'xfs', 'btrfs'].includes(c.mountFilesystem)) fail('hosted_workflow_no_backup_configuration_invalid');
  const p = c.connection;
  if (!exact(p, ['expectedProjectRef', 'host', 'port', 'database', 'user', 'psqlPath', 'sslRootCertPath', 'passwordFilePath']) ||
    p.expectedProjectRef !== RESET_PROJECT || p.host !== `db.${RESET_PROJECT}.supabase.co` || p.port !== 5432 || p.database !== 'postgres' ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(p.user) || !/^\/(?:usr\/bin|usr\/lib\/postgresql\/[1-9][0-9]*\/bin)\/psql$/.test(p.psqlPath) ||
    p.sslRootCertPath !== '/etc/nestory-reset/database-ca.pem' || p.passwordFilePath !== '/etc/nestory-reset/database.pgpass') fail('hosted_workflow_connection_invalid');
  if (!Array.isArray(c.operations) || c.operations.length !== 1) fail('hosted_workflow_operation_enrollment_invalid');
  const o = c.operations[0], optional = ['reconciliation', 'reopening'].filter(name => Object.hasOwn(o, name));
  if (!exact(o, ['operationId', 'packetSha256', 'descriptorsSha256', 'authoritySha256', 'mainSha', 'actions', ...optional]) ||
    !uuid.test(o.operationId) || !sha.test(o.mainSha) || !['packetSha256', 'descriptorsSha256', 'authoritySha256'].every(k => digest.test(o[k])) ||
    !Array.isArray(o.actions) || !o.actions.length || new Set(o.actions).size !== o.actions.length || o.actions.some(a => !noBackupActions.includes(a)) ||
    Object.hasOwn(o, 'reconciliation') && (!exact(o.reconciliation, ['authoritySha256']) || !digest.test(o.reconciliation.authoritySha256)) ||
    o.actions.includes('reopen') !== Object.hasOwn(o, 'reopening') ||
    Object.hasOwn(o, 'reopening') && (!exact(o.reopening, ['reviewSha256', 'authoritySha256', 'sessionAccessReviewSha256']) ||
      !Object.values(o.reopening).every(value => digest.test(value)))) fail('hosted_workflow_operation_enrollment_invalid');
  return c;
}

export function assertNoBackupRuntimeEvidence(evidence) {
  const { configuration: c, input, packet, provisioning: p, authority: a, provisioningBytes, authorityBytes, now, readAuthority, readAuthorityBytes } = evidence;
  assertNoBackupPacket(packet);
  const historical = readAuthority !== undefined;
  const reopening = input.action === 'reopen';
  const enrolled = c.operations[0];
  if (!isNoBackupWorkflow(c) || c.recoveryPolicy !== packet.recoveryPolicy || !Number.isSafeInteger(now) || now < 0 ||
    !['inspect', 'reconcile', 'complete-receipt', ...noBackupActions].includes(input.action) || requiresSupplementalRecovery(input) ||
    ['reconcile', 'complete-receipt'].includes(input.action) && !noBackupActions.includes(input['reconcile-action']) ||
    (reopening || input['reconcile-action'] === 'reopen') && (!enrolled.reopening || !enrolled.actions.includes('reopen')) ||
    reopening && (historical || input['authorization-id'] !== 'none') ||
    input.action === 'complete-receipt' && (historical || input['authorization-id'] !== 'none') ||
    input['operation-id'] !== packet.operation.operationId || input['packet-sha256'] !== packet.packetSha256 ||
    input['descriptors-sha256'] !== c.operations[0].descriptorsSha256 || c.operations[0].mainSha !== packet.operation.mainSha ||
    c.operations[0].packetSha256 !== packet.packetSha256 || c.operations[0].operationId !== packet.operation.operationId ||
    input['authority-sha256'] !== c.operations[0].authoritySha256 ||
    noBackupActions.includes(input.action) && !c.operations[0].actions.includes(input.action) ||
    ['reconcile', 'complete-receipt'].includes(input.action) && !c.operations[0].actions.includes(input['reconcile-action']) ||
    hashBytes(provisioningBytes) !== c.provisioningSha256 || hashBytes(authorityBytes) !== input['authority-sha256']) fail('hosted_workflow_evidence_digest_changed');
  if (historical) assertHistoricalReadAuthority({ configuration: c, input, packet, provisioning: p, readAuthority, readAuthorityBytes, now });
  if (!exact(p, ['format', 'runnerId', 'persistentRoot', 'journalStoreId', 'validUntil', 'privateAccessReviewSha256', 'crossRunDurabilityProofSha256']) ||
    p.format !== 'nestory-reset-reviewed-no-backup-provisioning-v1' || p.runnerId !== c.runnerId || p.persistentRoot !== RESET_PERSISTENT_ROOT ||
    p.journalStoreId !== c.journalStoreId || !['privateAccessReviewSha256', 'crossRunDurabilityProofSha256'].every(k => digest.test(p[k])) ||
    !Number.isFinite(Date.parse(p.validUntil)) || Date.parse(p.validUntil) <= now) fail('hosted_workflow_provisioning_unverified');
  if (!exact(a, ['format', 'recoveryPolicy', 'operationId', 'packetSha256', 'mainSha', 'projectRef', 'organizationId', 'actions',
    'issuedAt', 'validUntil', 'evidenceReferences', 'stageAuthorities', 'provisioningSha256']) ||
    a.format !== 'nestory-reset-reviewed-no-backup-runtime-authority-v1' || a.recoveryPolicy !== NO_BACKUP_POLICY ||
    a.operationId !== packet.operation.operationId || a.packetSha256 !== packet.packetSha256 || a.mainSha !== packet.operation.mainSha ||
    a.projectRef !== RESET_PROJECT || a.organizationId !== RESET_ORGANIZATION || a.provisioningSha256 !== c.provisioningSha256 ||
    !same(a.actions, enrolled.actions.filter(action => forwardActions.includes(action))) || !same(a.evidenceReferences, packet.evidenceReferences) || packet.evidenceBlockers.length ||
    !exact(a.stageAuthorities, a.actions) || Object.values(a.stageAuthorities).some(v => !digest.test(v)) ||
    !Number.isFinite(Date.parse(a.issuedAt)) || Date.parse(a.issuedAt) > now || !Number.isFinite(Date.parse(a.validUntil)) ||
    Date.parse(a.validUntil) <= Date.parse(a.issuedAt) || Date.parse(a.validUntil) > Date.parse(p.validUntil) ||
    !historical && !reopening && Date.parse(a.validUntil) <= now) fail('hosted_workflow_action_authority_unverified');
  // An expired original execution document is historical evidence on this
  // separate route. It cannot provide current authority for reopening.
  if (reopening) return Object.freeze({ authoritySha256: enrolled.reopening.authoritySha256, requiresReopeningEvidence: true });
  return Object.freeze({ authoritySha256: historical ? c.operations[0].reconciliation.authoritySha256 : hashBytes(authorityBytes) });
}

// Pure scope/expiry policy only. The fixed runtime must separately establish
// concrete current-session/read-result custody and protected configuration.
// Returning this shape cannot brand a callback or authorize a database write.
export function validateNoBackupReopeningRuntimeEvidence(request) {
  if (!exact(request, ['evidence', 'authorityInput', 'reopeningAuthority', 'reopeningAuthorityBytes', 'reviewText',
    'sessionAccessReviewBytes', 'postgresSemanticText', 'databaseRead', 'currentSession', 'now'])) fail('hosted_workflow_reopening_evidence_invalid');
  const { evidence, authorityInput: observed, reopeningAuthority: a, reopeningAuthorityBytes, reviewText,
    sessionAccessReviewBytes, postgresSemanticText, databaseRead, currentSession: session, now } = request;
  const { configuration: c, packet, input, provisioning: p } = evidence, enrolled = c.operations[0].reopening;
  const base = assertNoBackupRuntimeEvidence({ ...evidence, now });
  if (input.action !== 'reopen' || base.requiresReopeningEvidence !== true || !enrolled ||
    hashBytes(reopeningAuthorityBytes) !== enrolled.authoritySha256 || hashBytes(sessionAccessReviewBytes) !== enrolled.sessionAccessReviewSha256 ||
    typeof reviewText !== 'string' || hashBytes(reviewText) !== enrolled.reviewSha256 ||
    !exact(observed, ['packet', 'binding', 'proof', 'review', 'databaseAudit', 'journalMechanism', 'completionIntent',
      'completionReconciliation', 'completionHistory', 'completionHistoryProvenanceVerified']) ||
    !same(observed.packet, packet) || canonicalJson(observed.review) !== reviewText ||
    observed.completionHistoryProvenanceVerified !== false || observed.journalMechanism?.kind !== 'exclusive-file-and-directory-fsync' ||
    observed.journalMechanism.storeId !== c.journalStoreId || databaseRead?.kind !== 'reopening-audit') fail('hosted_workflow_reopening_evidence_invalid');
  const binding = observed.binding, audit = databaseRead.audit;
  const proof = validateNoBackupReopeningAudit({ packet, binding, postgresSemanticText, observation: databaseRead.observation, audit });
  if (!same(proof, observed.proof) || !same(audit, observed.databaseAudit)) fail('hosted_workflow_reopening_checkpoint_changed');
  const history = observed.completionHistory?.map(entry => ({ action: entry.action, intentText: entry.intentText, reconciliationText: entry.reconciliationText }));
  const completion = validateNoBackupCompletionHistory({ packet, binding, postgresSemanticText, observation: databaseRead.observation, audit, history });
  const historySha256 = hashBytes(canonicalJson(history.map(entry => ({ action: entry.action,
    intentSha256: hashBytes(entry.intentText), reconciliationSha256: hashBytes(entry.reconciliationText) }))));
  if (!same(observed.completionIntent, completion.completionIntent) || !same(observed.completionReconciliation, completion.completionReconciliation))
    fail('hosted_workflow_reopening_history_changed');
  if (!exact(a, ['format', 'recoveryPolicy', 'operationId', 'packetSha256', 'mainSha', 'projectRef', 'organizationId',
    'reviewSha256', 'bindingSha256', 'checkpointSha256', 'afterSha256', 'foreignSha256', 'executionBusinessDate', 'databaseAudit',
    'completionHistorySha256', 'actorId', 'sessionId', 'issuedAt', 'validUntil', 'evidenceReferences', 'provisioningSha256', 'sessionAccessReviewSha256']) ||
    a.format !== 'nestory-reset-reviewed-no-backup-reopening-authority-v1' || a.recoveryPolicy !== NO_BACKUP_POLICY ||
    a.operationId !== packet.operation.operationId || a.packetSha256 !== packet.packetSha256 || a.mainSha !== packet.operation.mainSha ||
    a.projectRef !== packet.operation.projectRef || a.organizationId !== packet.operation.organizationId ||
    a.reviewSha256 !== enrolled.reviewSha256 || a.bindingSha256 !== audit.bindingSha256 || a.checkpointSha256 !== proof.checkpointSha256 ||
    a.afterSha256 !== proof.afterSha256 || a.foreignSha256 !== proof.foreignSha256 || a.executionBusinessDate !== proof.businessDate ||
    !same(a.databaseAudit, audit.databaseAudit) || a.completionHistorySha256 !== historySha256 ||
    !same(a.evidenceReferences, packet.evidenceReferences) || a.provisioningSha256 !== c.provisioningSha256 ||
    a.sessionAccessReviewSha256 !== enrolled.sessionAccessReviewSha256 || a.actorId !== binding.continuation_semantic.actor_id ||
    !uuid.test(a.sessionId) || session?.actorId !== a.actorId || session.sessionId !== a.sessionId ||
    session.operationId !== packet.operation.operationId || session.packetSha256 !== packet.packetSha256 ||
    session.organizationId !== packet.operation.organizationId || session.projectRef !== packet.operation.projectRef ||
    session.sourcesSha256 !== packet.sourcesSha256 || session.schemaSha256 !== packet.schemaSha256 || session.ledgerSha256 !== packet.ledgerSha256 ||
    session.baseBindingSha256 !== hashBytes(canonicalJson(binding))) fail('hosted_workflow_reopening_scope_changed');
  const instant = BigInt(now) * 1000n, issued = timestampMicros(a.issuedAt), until = timestampMicros(a.validUntil),
    observedAt = timestampMicros(session.observedAt), inspectedUntil = timestampMicros(session.expiresAt), credential = timestampMicros(session.credentialExpiresAt),
    provisioningUntil = timestampMicros(p.validUntil);
  if (issued === null || until === null || observedAt === null || inspectedUntil === null || credential === null || provisioningUntil === null ||
    issued > instant || until <= instant || until <= issued || until - issued > 300000000n || until > provisioningUntil ||
    observedAt > instant || instant - observedAt > 30000000n || inspectedUntil <= instant || until > credential)
    fail('hosted_workflow_reopening_current_authority_required');
  for (const field of ['sessionNotAfter', 'stepUpExpiresAt']) {
    if (session[field] !== null) { const expires = timestampMicros(session[field]); if (expires === null || until > expires) fail('hosted_workflow_reopening_current_authority_required'); }
  }
  const receipt = { format: 'nestory-no-backup-reopening-authority-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operationId: binding.operation_id, organizationId: binding.organization_id, packetSha256: packet.packetSha256,
    bindingSha256: audit.bindingSha256, checkpointSha256: proof.checkpointSha256, afterSha256: proof.afterSha256,
    foreignSha256: proof.foreignSha256, reviewSha256: enrolled.reviewSha256, databaseAudit: audit.databaseAudit,
    evidenceReferences: packet.evidenceReferences, actorId: session.actorId, sessionId: session.sessionId,
    executionBusinessDate: proof.businessDate, observedAt: session.observedAt, expiresAt: a.validUntil };
  return validateNoBackupReopeningAuthority({ packet, binding, proof, reviewSha256: enrolled.reviewSha256, audit, receipt });
}

export function validateNoBackupRuntimeInputs(descriptors, input, packet, configuration, bytes, inputBytes, evidenceBytes) {
  assertNoBackupPacket(packet);
  if (!isNoBackupWorkflow(configuration) || hashBytes(bytes) !== input['descriptors-sha256'] ||
    configuration.operations[0].descriptorsSha256 !== input['descriptors-sha256'] ||
    input['operation-id'] !== packet.operation.operationId || input['packet-sha256'] !== packet.packetSha256 ||
    configuration.operations[0].operationId !== packet.operation.operationId || configuration.operations[0].packetSha256 !== packet.packetSha256 ||
    !exact(descriptors, ['format', 'recoveryPolicy', 'operationId', 'packetSha256', 'inputs']) ||
    descriptors.format !== 'nestory-no-backup-reviewed-inputs-v1' || descriptors.recoveryPolicy !== NO_BACKUP_POLICY ||
    descriptors.operationId !== packet.operation.operationId || descriptors.packetSha256 !== packet.packetSha256 ||
    !exact(descriptors.inputs, NO_BACKUP_RUNTIME_INPUT_ROLES) || !exact(inputBytes, NO_BACKUP_RUNTIME_INPUT_ROLES) ||
    !exact(evidenceBytes, NO_BACKUP_EVIDENCE_ROLES)) fail('hosted_workflow_no_backup_inputs_invalid');
  for (const role of NO_BACKUP_RUNTIME_INPUT_ROLES) {
    const ref = descriptors.inputs[role], content = inputBytes[role];
    if (!exact(ref, ['sha256', 'bytes']) || !digest.test(ref.sha256) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 ||
      !(content instanceof Uint8Array) || content.byteLength !== ref.bytes || hashBytes(content) !== ref.sha256) fail('hosted_workflow_no_backup_input_bytes_changed');
  }
  if (hashBytes(inputBytes.postgresSemantic) !== packet.databaseBinding.continuationSemanticSha256 ||
    hashBytes(inputBytes.zeroPlan) !== packet.databaseBinding.zeroReviewSha256) fail('hosted_workflow_database_text_changed');
  for (const role of NO_BACKUP_EVIDENCE_ROLES) {
    const ref = packet.evidenceReferences[role], content = evidenceBytes[role];
    if (!ref || !(content instanceof Uint8Array) || content.byteLength !== ref.bytes || hashBytes(content) !== ref.sha256) fail('hosted_workflow_evidence_scope_changed');
  }
  return true;
}

export function assertHostedSourceCoverage(packet) {
  if (HOSTED_BOUND_SOURCE_FILES.some(name => !packet.sourceFiles.some(source => source.path === name))) fail('hosted_workflow_source_coverage_missing');
}

export function summarizeHostedInspection(packet, observation) {
  assertOperatorPacket(packet);
  // Observation numbers include fractional ownership and financial values.
  // This is a summary digest, never a replacement for PostgreSQL row/plan hashes.
  return { status: 'observed-read-only', operationId: packet.operation.operationId,
    observationSha256: digestDatabaseJson(observation) };
}

export function requiresSupplementalRecovery(input) {
  return (input.action === 'reconcile' ? input['reconcile-action'] : input.action).endsWith('recovery');
}

// The protected configuration pins a NEW, independently reviewed inverse plan.
// No future checkpoint is guessed, and the original packet is never rewritten.
export function assertSupplementalRecoveryEvidence({ configuration, input, packet, expected, descriptor, authority,
  expectedBytes, descriptorBytes, authorityBytes, provisioning, now, readAuthority, readAuthorityBytes }) {
  const historicalRead = readAuthority !== undefined;
  if (historicalRead) assertHistoricalReadAuthority({ configuration, input, packet, provisioning, readAuthority, readAuthorityBytes, now });
  const enrollment = configuration.operations[0].recovery;
  const expectedFields = ['restoreOperationId', 'originalOperationId', 'projectRef', 'organizationId', 'mainSha',
    'sourcesSha256', 'reportCheckpointSha256', 'postSourceSha256', 'recoverySourcesSha256',
    'phaseBindingSha256', 'actionMappingSha256', 'executionBusinessDate'];
  if (!requiresSupplementalRecovery(input) || !enrollment || !Number.isSafeInteger(now) ||
    hashBytes(expectedBytes) !== enrollment.expectedSha256 || hashBytes(descriptorBytes) !== enrollment.descriptorSha256 ||
    hashBytes(authorityBytes) !== enrollment.authoritySha256 || !exact(expected, expectedFields) ||
    expected.restoreOperationId !== enrollment.operationId || expected.originalOperationId !== packet.operation.operationId ||
    expected.projectRef !== RESET_PROJECT || expected.organizationId !== RESET_ORGANIZATION || expected.mainSha !== packet.operation.mainSha ||
    expected.sourcesSha256 !== packet.sourcesSha256 || !/^\d{4}-\d{2}-\d{2}$/.test(expected.executionBusinessDate) ||
    !Number.isFinite(Date.parse(`${expected.executionBusinessDate}T00:00:00Z`)) ||
    new Date(`${expected.executionBusinessDate}T00:00:00Z`).toISOString().slice(0, 10) !== expected.executionBusinessDate ||
    ['sourcesSha256', 'reportCheckpointSha256', 'postSourceSha256', 'recoverySourcesSha256', 'phaseBindingSha256', 'actionMappingSha256'].some(name => !digest.test(expected[name]))) fail('hosted_workflow_recovery_evidence_invalid');
  if (descriptor?.keyId !== configuration.keyId || !digest.test(descriptor?.ciphertextSha256) ||
    !same(descriptor.binding, { operationId: enrollment.operationId, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
      mainSha: packet.operation.mainSha, sourceSnapshotSha256: expected.postSourceSha256, sourcesSha256: packet.sourcesSha256, role: 'recoveryPlan' })) fail('hosted_workflow_recovery_descriptor_invalid');
  if (!exact(authority, ['format', 'originalOperationId', 'restoreOperationId', 'originalPacketSha256', 'mainSha', 'projectRef',
    'organizationId', 'actions', 'validUntil', 'expectedSha256', 'descriptorSha256', 'artifactSha256', 'liveConsentSha256',
    'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256', 'provisioningSha256']) ||
    authority.format !== 'nestory-reset-reviewed-recovery-authority-v1' || authority.originalOperationId !== packet.operation.operationId ||
    authority.restoreOperationId !== enrollment.operationId || authority.originalPacketSha256 !== packet.packetSha256 ||
    authority.mainSha !== packet.operation.mainSha || authority.projectRef !== RESET_PROJECT || authority.organizationId !== RESET_ORGANIZATION ||
    !same(authority.actions, ['prepare-recovery', 'execute-recovery']) || authority.actions.some(action => !configuration.operations[0].actions.includes(action)) ||
    authority.expectedSha256 !== enrollment.expectedSha256 || authority.descriptorSha256 !== enrollment.descriptorSha256 ||
    authority.artifactSha256 !== descriptor.ciphertextSha256 || authority.provisioningSha256 !== configuration.provisioningSha256 ||
    !['liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256'].every(name => digest.test(authority[name])) ||
    !Number.isFinite(Date.parse(authority.validUntil)) || (!historicalRead && (Date.parse(authority.validUntil) <= now ||
    Date.parse(authority.validUntil) > Date.parse(provisioning.validUntil)))) fail('hosted_workflow_recovery_authority_unverified');
  // The transport accepts exactly this opaque authority shape. Artifact and
  // checkpoint identity were verified above and remain in the pinned evidence.
  return Object.freeze({ authoritySha256: enrollment.authoritySha256 });
}

export function assertHistoricalReadAuthority({ configuration, input, packet, provisioning, readAuthority, readAuthorityBytes, now }) {
  const enrolled = configuration.operations[0], authority = readAuthority;
  if (input.action !== 'reconcile' || input['authorization-id'] !== 'none' || !actions.includes(input['reconcile-action']) ||
    input['operation-id'] !== enrolled.operationId || enrolled.operationId !== packet.operation.operationId ||
    input['packet-sha256'] !== enrolled.packetSha256 || enrolled.packetSha256 !== packet.packetSha256 || enrolled.mainSha !== packet.operation.mainSha ||
    input['descriptors-sha256'] !== enrolled.descriptorsSha256 || input['authority-sha256'] !== enrolled.authoritySha256 ||
    !enrolled.actions.includes(input['reconcile-action']) || !enrolled.reconciliation ||
    hashBytes(readAuthorityBytes) !== enrolled.reconciliation.authoritySha256 ||
    !exact(authority, ['format', 'operationId', 'packetSha256', 'mainSha', 'projectRef', 'organizationId',
      'originalAuthoritySha256', 'actions', 'validUntil', 'provisioningSha256']) ||
    authority.format !== 'nestory-reset-reviewed-read-authority-v1' || authority.operationId !== packet.operation.operationId ||
    authority.packetSha256 !== packet.packetSha256 || authority.mainSha !== packet.operation.mainSha ||
    authority.projectRef !== RESET_PROJECT || authority.organizationId !== RESET_ORGANIZATION ||
    authority.originalAuthoritySha256 !== enrolled.authoritySha256 || !same(authority.actions, ['reconcile']) ||
    authority.provisioningSha256 !== configuration.provisioningSha256 || !Number.isSafeInteger(now) ||
    !Number.isFinite(Date.parse(authority.validUntil)) || Date.parse(authority.validUntil) <= now ||
    Date.parse(authority.validUntil) > Date.parse(provisioning.validUntil)) fail('hosted_workflow_current_read_authority_required');
  return Object.freeze({ authoritySha256: enrolled.reconciliation.authoritySha256 });
}

// Path observations come from lstat/realpath for EVERY ancestor, not from config.
// Both the dedicated account and root are trusted; all group/other writes fail.
export function assertPrivatePathObservation({ requested, resolved, ancestors, uid, kind, privateLeaf = true }) {
  if (!absolutePath(requested) || requested !== resolved || !Number.isSafeInteger(uid) || uid < 0 ||
    !['file', 'directory'].includes(kind) || !Array.isArray(ancestors)) fail('hosted_workflow_path_invalid');
  const pieces = requested.split('/').filter(Boolean);
  const expected = ['/', ...pieces.map((_, index) => `/${pieces.slice(0, index + 1).join('/')}`)];
  if (ancestors.length !== expected.length) fail('hosted_workflow_path_invalid');
  for (let index = 0; index < expected.length; index++) {
    const entry = ancestors[index];
    const leaf = index === expected.length - 1;
    if (!exact(entry, ['path', 'type', 'uid', 'mode']) || entry.path !== expected[index] ||
      entry.type !== (leaf ? kind : 'directory') || ![0, uid].includes(entry.uid) ||
      !Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777 || (entry.mode & 0o022) !== 0 ||
      (leaf && privateLeaf && ((entry.mode & 0o077) !== 0 || entry.uid !== uid))) fail('hosted_workflow_path_untrusted');
  }
}

export function assertPersistentMount(configuration, mountInfo) {
  if (typeof mountInfo !== 'string' || mountInfo.length > 1024 * 1024) fail('hosted_workflow_mount_invalid');
  const matches = mountInfo.split('\n').filter(Boolean).map(line => line.split(' '))
    .filter(fields => fields[4] === RESET_PERSISTENT_ROOT);
  if (matches.length !== 1) fail('hosted_workflow_persistent_mount_required');
  const fields = matches[0], separator = fields.indexOf('-');
  if (separator < 6 || fields[3] !== '/' || fields[5].split(',').includes('ro') ||
    fields[separator + 1] !== configuration.mountFilesystem || hashBytes(fields[separator + 2] ?? '') !== configuration.mountSourceSha256) fail('hosted_workflow_mount_changed');
}

export function assertWorkflowInvocation({ input, packet, configuration, environment, gitHead, currentMain, run, jobs, workflowBytes, now }) {
  if (isNoBackupWorkflow(configuration)) assertNoBackupPacket(packet); else assertOperatorPacket(packet);
  if (!Number.isSafeInteger(now) || now < 0 || environment.GITHUB_ACTIONS !== 'true' || environment.RUNNER_OS !== 'Linux' ||
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' || environment.GITHUB_REPOSITORY !== RESET_REPOSITORY ||
    environment.GITHUB_REF !== 'refs/heads/main' || environment.GITHUB_WORKFLOW_REF !== `${RESET_REPOSITORY}/${RESET_WORKFLOW_PATH}@refs/heads/main` ||
    !sha.test(environment.GITHUB_SHA ?? '') || environment.GITHUB_WORKFLOW_SHA !== environment.GITHUB_SHA || gitHead !== environment.GITHUB_SHA || currentMain !== gitHead ||
    packet.operation.mainSha !== gitHead || packet.operation.projectRef !== RESET_PROJECT || packet.operation.organizationId !== RESET_ORGANIZATION ||
    packet.packetSha256 !== input['packet-sha256'] || packet.operation.operationId !== input['operation-id']) fail('hosted_workflow_invocation_invalid');
  const enrolled = configuration.operations[0];
  const actionEnrolled = input.action === 'complete-receipt'
    ? isNoBackupWorkflow(configuration) && noBackupActions.includes(input['reconcile-action']) && enrolled.actions.includes(input['reconcile-action'])
    : !actions.includes(input.action) || enrolled.actions.includes(input.action);
  if (enrolled.operationId !== input['operation-id'] || enrolled.packetSha256 !== packet.packetSha256 || enrolled.mainSha !== gitHead ||
    enrolled.descriptorsSha256 !== input['descriptors-sha256'] || enrolled.authoritySha256 !== input['authority-sha256'] ||
    !actionEnrolled) fail('hosted_workflow_operation_not_enrolled');
  if (!run || String(run.id) !== environment.GITHUB_RUN_ID || String(run.run_attempt) !== environment.GITHUB_RUN_ATTEMPT ||
    run.head_sha !== gitHead || run.head_branch !== 'main' || run.event !== 'workflow_dispatch' || run.status !== 'in_progress' ||
    run.path !== RESET_WORKFLOW_PATH || run.repository?.full_name !== RESET_REPOSITORY ||
    !Array.isArray(jobs?.jobs) || jobs.total_count !== jobs.jobs.length || jobs.jobs.filter(job => job.name === 'Pilot financial reset' &&
      job.status === 'in_progress' && job.runner_id === configuration.runnerId && job.run_id === run.id && job.run_attempt === run.run_attempt).length !== 1) fail('hosted_workflow_running_job_unverified');
  const source = packet.sourceFiles.find(file => file.path === RESET_WORKFLOW_PATH);
  if (!source || hashSourceBytes(workflowBytes) !== source.sha256) fail('hosted_workflow_source_changed');
  return Object.freeze({ runId: run.id, runAttempt: run.run_attempt, runnerId: configuration.runnerId, mainSha: gitHead,
    workflowSourceSha256: source.sha256, observedAt: new Date(now).toISOString() });
}

export function assertProtectedEnvironment(metadata, protectedBranchNames, deploymentPolicies) {
  if (metadata?.name !== 'production-database' || !Array.isArray(metadata.protection_rules) ||
    !metadata.protection_rules.some(rule => rule.type === 'branch_policy') ||
    !metadata.deployment_branch_policy) fail('hosted_workflow_environment_unprotected');
  const policy = metadata.deployment_branch_policy;
  const protectedMainOnly = policy.protected_branches === true && policy.custom_branch_policies === false && same(protectedBranchNames, ['main']);
  const exactCustomMain = policy.protected_branches === false && policy.custom_branch_policies === true &&
    Array.isArray(deploymentPolicies?.branch_policies) && deploymentPolicies.total_count === 1 &&
    deploymentPolicies.branch_policies.length === 1 && deploymentPolicies.branch_policies[0].name === 'main' &&
    deploymentPolicies.branch_policies[0].type === 'branch';
  if (!protectedMainOnly && !exactCustomMain) fail('hosted_workflow_main_only_environment_required');
}

export function assertRuntimeEvidence({ configuration, input, packet, provisioning, authority, provisioningBytes, authorityBytes, now,
  readAuthority, readAuthorityBytes }) {
  if (isNoBackupWorkflow(configuration)) return assertNoBackupRuntimeEvidence({ configuration, input, packet, provisioning, authority,
    provisioningBytes, authorityBytes, now, readAuthority, readAuthorityBytes });
  const historicalRead = readAuthority !== undefined;
  if (historicalRead) assertHistoricalReadAuthority({ configuration, input, packet, provisioning, readAuthority, readAuthorityBytes, now });
  if (hashBytes(provisioningBytes) !== configuration.provisioningSha256 || hashBytes(authorityBytes) !== input['authority-sha256']) fail('hosted_workflow_evidence_digest_changed');
  if (!exact(provisioning, ['format', 'runnerId', 'persistentRoot', 'journalStoreId', 'artifactStoreId', 'keyId', 'retainedUntil', 'validUntil',
    'privateAccessReviewSha256', 'keyRecoveryProofSha256', 'crossRunDurabilityProofSha256', 'retentionPolicySha256']) ||
    provisioning.format !== 'nestory-reset-reviewed-provisioning-v1' || provisioning.runnerId !== configuration.runnerId ||
    provisioning.persistentRoot !== RESET_PERSISTENT_ROOT || provisioning.journalStoreId !== configuration.journalStoreId ||
    provisioning.artifactStoreId !== configuration.artifactStoreId || provisioning.keyId !== configuration.keyId ||
    !['privateAccessReviewSha256', 'keyRecoveryProofSha256', 'crossRunDurabilityProofSha256', 'retentionPolicySha256'].every(name => digest.test(provisioning[name])) ||
    !Number.isFinite(Date.parse(provisioning.validUntil)) || Date.parse(provisioning.validUntil) <= now ||
    !Number.isFinite(Date.parse(provisioning.retainedUntil)) || Date.parse(provisioning.retainedUntil) < Date.parse(provisioning.validUntil)) fail('hosted_workflow_provisioning_unverified');
  if (!exact(authority, ['format', 'operationId', 'packetSha256', 'mainSha', 'projectRef', 'organizationId', 'actions', 'validUntil',
    'liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256', 'provisioningSha256']) ||
    authority.format !== 'nestory-reset-reviewed-execution-authority-v1' || authority.operationId !== packet.operation.operationId ||
    authority.packetSha256 !== packet.packetSha256 || authority.mainSha !== packet.operation.mainSha || authority.projectRef !== RESET_PROJECT ||
    authority.organizationId !== RESET_ORGANIZATION || authority.provisioningSha256 !== configuration.provisioningSha256 ||
    !same(authority.actions, configuration.operations[0].actions) || !Number.isFinite(Date.parse(authority.validUntil)) ||
    (!historicalRead && Date.parse(authority.validUntil) <= now) ||
    Date.parse(authority.validUntil) > Date.parse(provisioning.validUntil)) fail('hosted_workflow_action_authority_unverified');
  for (const [field, role] of [['liveConsentSha256', 'liveConsent'], ['containmentProofSha256', 'containmentProof'], ['restoreProofSha256', 'restoreProof'], ['storageProofSha256', 'storageProof']]) {
    if (!digest.test(authority[field]) || authority[field] !== packet.artifacts[role]?.sha256) fail('hosted_workflow_evidence_scope_changed');
  }
  return Object.freeze({ authoritySha256: historicalRead ? configuration.operations[0].reconciliation.authoritySha256 : hashBytes(authorityBytes) });
}

export function validateHostedDescriptors(descriptors, input, packet, configuration, bytes) {
  if (hashBytes(bytes) !== input['descriptors-sha256'] || !exact(descriptors, Object.keys(packet.artifacts))) fail('hosted_workflow_descriptors_invalid');
  for (const [role, descriptor] of Object.entries(descriptors)) {
    if (descriptor?.keyId !== configuration.keyId || descriptor?.binding?.role !== role ||
      descriptor?.binding?.operationId !== packet.operation.operationId || descriptor?.binding?.projectRef !== RESET_PROJECT ||
      descriptor?.binding?.organizationId !== RESET_ORGANIZATION || descriptor?.binding?.mainSha !== packet.operation.mainSha ||
      descriptor?.binding?.sourcesSha256 !== packet.sourcesSha256 || descriptor?.binding?.sourceSnapshotSha256 !== packet.sourceSnapshotSha256 ||
      descriptor?.ciphertextSha256 !== packet.artifacts[role]?.sha256 || descriptor?.ciphertextByteLength !== packet.artifacts[role]?.bytes) fail('hosted_workflow_descriptor_scope_changed');
  }
}
