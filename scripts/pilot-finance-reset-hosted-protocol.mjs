// Fixed read-only reconciliation protocol. No SQL execution or reset authority.
import { assertOperatorPacket, canonicalJson, hashBytes, operationBusinessDate } from './pilot-finance-reset-operator-core.mjs';
import { assertNoBackupPacket, assertNoBackupHostedBinding } from './pilot-finance-reset-no-backup-core.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const fail = code => { throw new Error(code); };
export const exactKeys = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  canonicalJson(Object.keys(value).sort()) === canonicalJson([...fields].sort());
export const digestJson = value => hashBytes(canonicalJson(value));
export const same = (a, b) => canonicalJson(a) === canonicalJson(b);
export const isNoBackupApprovalPacket = packet => packet?.format === 'nestory-protected-reset-no-backup-preparation-v1';
export function assertApprovalPacket(packet) {
  return isNoBackupApprovalPacket(packet) ? assertNoBackupPacket(packet) : assertOperatorPacket(packet);
}
export function approvalTimestampMicros(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[1].startsWith('0000-')) return null;
  const utc = Date.parse(`${match[1]}Z`), instant = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(utc) || !Number.isFinite(instant) || new Date(utc).toISOString().slice(0, 19) !== match[1]) return null;
  return BigInt(instant) * 1000n + BigInt((match[2] ?? '').padEnd(6, '0'));
}
export const HOSTED_SOURCE_FILES = Object.freeze([
  'scripts/pilot-finance-reset-operator-core.mjs',
  'scripts/pilot-finance-reset-no-backup-core.mjs',
  'scripts/pilot-finance-reset-hosted-protocol.mjs',
  'scripts/pilot-finance-reset-hosted-approval.mjs',
]);

// An independently pinned protected reader must execute this one parameterized
// SELECT in a repeatable-read, read-only transaction. No caller SQL is accepted.
// This query exposes only operation/approval metadata, never archived row images.
const endorsementProjection = `jsonb_build_object('endorsementId',e.endorsement_id,'operationId',e.operation_id,'organizationId',e.organization_id,
 'kind',e.approval_kind,'number',e.endorsement_number,'reviewSha256',e.review_sha256,'actorId',e.actor_id,
 'sessionId',e.session_id,'credentialExpiresAt',e.credential_expires_at,'endorsedAt',e.endorsed_at)`;
const approvalSql = `WITH requested AS (SELECT $1::uuid AS operation_id,$2::integer AS endorsement_number),
latest AS (SELECT DISTINCT ON (e.approval_kind) e.* FROM app_private.financial_reset_zero_session_endorsements e
 JOIN requested r USING(operation_id) ORDER BY e.approval_kind,e.endorsement_number DESC)
SELECT jsonb_build_object(
 'operation',(SELECT jsonb_build_object(
  'operationId',o.operation_id,'organizationId',o.organization_id,'kind',o.operation_kind,'restoreOf',o.restore_of,
  'status',o.status,'sourceGeneration',o.source_generation,'targetGeneration',o.target_generation,
  'manifestSha256',o.manifest_sha256,'planSha256',o.plan_sha256,'schemaSha256',o.schema_sha256,
  'archiveSha256',o.archive_sha256,'actionSha256',o.action_sha256,'archiveRows',o.archive_count,'actionCount',o.action_count,
  'appliedCount',(SELECT count(*) FROM app_private.financial_reset_actions a WHERE a.operation_id=o.operation_id AND a.applied_at IS NOT NULL))
  FROM app_private.financial_reset_operations o JOIN requested r USING(operation_id)),
 'control',(SELECT jsonb_build_object('status',c.status,'generation',c.generation,'cutoff',c.financial_start_date,
  'timezone',g.operational_timezone,'businessDate',app_private.rent_business_date(g.id,statement_timestamp()))
  FROM app_private.financial_reset_operations o JOIN requested r USING(operation_id)
  JOIN app_private.financial_write_controls c USING(organization_id) JOIN public.organizations g ON g.id=o.organization_id),
 'zeroPlan',(SELECT jsonb_build_object('status',z.status,'reviewSha256',z.review_sha256,
  'canonicalSha256',app_private.financial_reset_hash(z.plan_json),'operationId',z.plan_json->>'operation_id',
  'organizationId',z.plan_json->>'organization_id','manifestSha256',z.plan_json->>'manifest_sha256',
  'planSha256',z.plan_json->>'reset_plan_sha256','effectiveDate',z.plan_json->>'effective_date',
  'makerActorId',z.plan_json->>'maker_actor_id','reviewerActorId',z.plan_json->>'reviewer_actor_id')
  FROM app_private.financial_reset_zero_plans z JOIN requested r USING(operation_id)),
 'approvals',(SELECT coalesce(jsonb_agg(jsonb_build_object('operationId',a.operation_id,'organizationId',a.organization_id,
  'kind',a.approval_kind,'reviewSha256',a.review_sha256,'approvedBy',a.approved_by,'approvedAt',a.approved_at)
  ORDER BY a.approval_kind),'[]'::jsonb) FROM app_private.financial_reset_zero_approvals a JOIN requested r USING(operation_id)),
 'endorsements',(SELECT coalesce(jsonb_agg(${endorsementProjection}||jsonb_build_object('availability',
  app_private.financial_reset_zero_endorsement_status(e.operation_id,e.approval_kind)) ORDER BY e.approval_kind),'[]'::jsonb) FROM latest e),
 'targetEndorsements',(SELECT coalesce(jsonb_agg(${endorsementProjection} ORDER BY e.approval_kind),'[]'::jsonb)
  FROM app_private.financial_reset_zero_session_endorsements e JOIN requested r USING(operation_id) WHERE e.endorsement_number=r.endorsement_number),
 'capabilityCount',(SELECT count(*) FROM app_private.financial_reset_transaction_capabilities c JOIN requested r USING(operation_id))
) AS financial_reset_approval_observation`;

// The explicit no-backup branch must observe the complete immutable reservation,
// not infer its recovery policy or packet identity from matching accounting hashes.
// PostgreSQL semantic text remains the authoritative byte witness; JavaScript
// serialization is never substituted for its reviewed database digest.
const noBackupApprovalSql = approvalSql.replace(/\n\) AS financial_reset_approval_observation$/, `,
 'reservation',(SELECT jsonb_build_object('binding',h.binding,'bindingSha256',h.binding_sha256,
  'canonicalSha256',app_private.financial_reset_hash(h.binding),'foreignSha256',h.foreign_sha256,
  'continuationSemanticText',(h.binding->'continuation_semantic')::text)
  FROM app_private.financial_reset_hosted_reservations h JOIN requested r USING(operation_id))
) AS financial_reset_approval_observation`);

export function approvalObservationQuery(packet, endorsementNumber = null) {
  assertApprovalPacket(packet);
  if (endorsementNumber !== null && (!Number.isSafeInteger(endorsementNumber) || endorsementNumber < 1 || endorsementNumber > 2147483647)) fail('hosted_approval_endorsement_number_invalid');
  const noBackup = isNoBackupApprovalPacket(packet);
  return Object.freeze({ name: noBackup ? 'financial-reset-zero-approval-no-backup-observation-v1' : 'financial-reset-zero-approval-observation-v2',
    projectRef: packet.operation.projectRef, packetSha256: packet.packetSha256,
    transaction: Object.freeze({ isolation: 'repeatable read', readOnly: true }),
    text: noBackup ? noBackupApprovalSql : approvalSql, values: Object.freeze([packet.operation.operationId, endorsementNumber]) });
}

export function validateApprovalObservation(packet, rows, endorsementNumber = null) {
  assertApprovalPacket(packet);
  if (endorsementNumber !== null && (!Number.isSafeInteger(endorsementNumber) || endorsementNumber < 1 || endorsementNumber > 2147483647)) fail('hosted_approval_endorsement_number_invalid');
  // A requested immutable ordinal is a historical receipt lookup. Readiness
  // remains mandatory for the default observation used before every RPC.
  const historical = endorsementNumber !== null;
  if (!Array.isArray(rows) || rows.length !== 1 || !exactKeys(rows[0], ['financial_reset_approval_observation'])) fail('hosted_approval_observation_shape_invalid');
  const observation = rows[0].financial_reset_approval_observation;
  const noBackup = isNoBackupApprovalPacket(packet);
  if (!exactKeys(observation, ['operation', 'control', 'zeroPlan', 'approvals', 'endorsements', 'targetEndorsements', 'capabilityCount',
    ...(noBackup ? ['reservation'] : [])])) fail('hosted_approval_observation_shape_invalid');
  if (noBackup) {
    const r = observation.reservation;
    if (!exactKeys(r, ['binding', 'bindingSha256', 'canonicalSha256', 'foreignSha256', 'continuationSemanticText']) ||
      !/^[a-f0-9]{64}$/.test(r.bindingSha256) || r.canonicalSha256 !== r.bindingSha256 ||
      r.foreignSha256 !== packet.foreignSnapshotSha256) fail('hosted_approval_reservation_changed');
    try { assertNoBackupHostedBinding(packet, r.binding, r.continuationSemanticText); }
    catch { fail('hosted_approval_reservation_changed'); }
  }
  const o = observation.operation, z = observation.zeroPlan, c = observation.control;
  if (!exactKeys(o, ['operationId', 'organizationId', 'kind', 'restoreOf', 'status', 'sourceGeneration', 'targetGeneration',
    'manifestSha256', 'planSha256', 'schemaSha256', 'archiveSha256', 'actionSha256', 'archiveRows', 'actionCount', 'appliedCount']) ||
    o.operationId !== packet.operation.operationId || o.organizationId !== packet.operation.organizationId || o.kind !== 'reset' || o.restoreOf !== null ||
    !(historical ? ['prepared', 'sealed', 'executing', 'actions_complete'] : ['prepared', 'sealed']).includes(o.status) ||
    o.sourceGeneration !== packet.operation.sourceGeneration || o.targetGeneration !== packet.operation.targetGeneration ||
    o.schemaSha256 !== packet.schemaSha256 || o.archiveRows !== packet.archiveRows || o.actionCount !== packet.actionCount ||
    !Number.isSafeInteger(o.appliedCount) || o.appliedCount < 0 || o.appliedCount > o.actionCount || (!historical && o.appliedCount !== 0) ||
    ['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256'].some(k => o[k] !== packet.databaseBinding[k])) fail('hosted_approval_operation_changed');
  if (!exactKeys(c, ['status', 'generation', 'cutoff', 'timezone', 'businessDate']) || !['open', 'frozen'].includes(c.status) ||
    !Number.isSafeInteger(c.generation) || c.generation < packet.operation.targetGeneration || typeof c.timezone !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(c.cutoff) || !/^\d{4}-\d{2}-\d{2}$/.test(c.businessDate) ||
    !Number.isSafeInteger(observation.capabilityCount) || observation.capabilityCount < 0 ||
    (!historical && (c.status !== 'frozen' || c.generation !== packet.operation.targetGeneration || c.cutoff !== packet.operation.cutoff ||
      c.timezone !== packet.operation.timezone || c.businessDate !== operationBusinessDate(packet.operation) || observation.capabilityCount !== 0))) fail('hosted_approval_frozen_context_changed');
  if (!exactKeys(z, ['status', 'reviewSha256', 'canonicalSha256', 'operationId', 'organizationId', 'manifestSha256', 'planSha256', 'effectiveDate', 'makerActorId', 'reviewerActorId']) ||
    !(historical ? ['prepared', 'complete'] : ['prepared']).includes(z.status) || z.reviewSha256 !== packet.databaseBinding.zeroReviewSha256 || z.canonicalSha256 !== z.reviewSha256 ||
    z.operationId !== o.operationId || z.organizationId !== o.organizationId || z.manifestSha256 !== o.manifestSha256 || z.planSha256 !== o.planSha256 ||
    z.effectiveDate !== packet.operation.cutoff || !uuid.test(z.makerActorId) || !uuid.test(z.reviewerActorId) || z.makerActorId === z.reviewerActorId) fail('hosted_approval_plan_changed');
  if (!Array.isArray(observation.approvals) || observation.approvals.length > 2) fail('hosted_approval_rows_invalid');
  const kinds = new Set();
  for (const a of observation.approvals) {
    if (!exactKeys(a, ['operationId', 'organizationId', 'kind', 'reviewSha256', 'approvedBy', 'approvedAt']) ||
      !['maker', 'reviewer'].includes(a.kind) || kinds.has(a.kind) || a.operationId !== o.operationId || a.organizationId !== o.organizationId ||
      a.reviewSha256 !== z.reviewSha256 || a.approvedBy !== z[`${a.kind}ActorId`] || typeof a.approvedAt !== 'string' ||
      approvalTimestampMicros(a.approvedAt) === null) fail('hosted_approval_rows_invalid');
    kinds.add(a.kind);
  }
  const endorsementFields = ['endorsementId', 'operationId', 'organizationId', 'kind', 'number', 'reviewSha256', 'actorId', 'sessionId', 'credentialExpiresAt', 'endorsedAt'];
  for (const [field, latest] of [['endorsements', true], ['targetEndorsements', false]]) {
    if (!Array.isArray(observation[field]) || observation[field].length > 2 || (!latest && endorsementNumber === null && observation[field].length)) fail('hosted_approval_endorsement_rows_invalid');
    const seen = new Set();
    for (const e of observation[field]) {
      const approval = observation.approvals.find(a => a.kind === e?.kind);
      const expires = approvalTimestampMicros(e?.credentialExpiresAt), endorsed = approvalTimestampMicros(e?.endorsedAt);
      if (!exactKeys(e, latest ? [...endorsementFields, 'availability'] : endorsementFields) || !uuid.test(e.endorsementId) ||
        !approval || seen.has(e.kind) || e.operationId !== o.operationId || e.organizationId !== o.organizationId || e.reviewSha256 !== z.reviewSha256 ||
        e.actorId !== approval.approvedBy || !uuid.test(e.sessionId) || !Number.isSafeInteger(e.number) || e.number < 1 || e.number > 2147483647 ||
        (!latest && e.number !== endorsementNumber) || expires === null || endorsed === null || expires <= endorsed) fail('hosted_approval_endorsement_rows_invalid');
      if (latest && (!exactKeys(e.availability, ['status', 'observedAt']) || !['current', 'expired', 'not-current'].includes(e.availability.status) ||
        approvalTimestampMicros(e.availability.observedAt) === null ||
        (e.availability.status === 'current' && expires <= approvalTimestampMicros(e.availability.observedAt)))) fail('hosted_approval_endorsement_status_invalid');
      seen.add(e.kind);
    }
  }
  for (const target of observation.targetEndorsements) {
    const latest = observation.endorsements.find(e => e.kind === target.kind);
    if (!latest || latest.number < target.number || (latest.number === target.number && !same(immutableEndorsement(latest), target))) fail('hosted_approval_endorsement_rows_invalid');
  }
  return observation;
}

export function immutableEndorsement(endorsement) {
  if (!endorsement) return null;
  const immutable = { ...endorsement };
  delete immutable.availability;
  return immutable;
}

export function approvalReadinessMatches(packet, observation) {
  const o = observation.operation, c = observation.control;
  return ['prepared', 'sealed'].includes(o.status) && o.appliedCount === 0 && observation.zeroPlan.status === 'prepared' &&
    c.status === 'frozen' && c.generation === packet.operation.targetGeneration && c.cutoff === packet.operation.cutoff &&
    c.timezone === packet.operation.timezone && c.businessDate === operationBusinessDate(packet.operation) && observation.capabilityCount === 0;
}

export function approvalIdentity(packet, kind) {
  assertApprovalPacket(packet);
  if (!['maker', 'reviewer'].includes(kind)) fail('hosted_approval_kind_invalid');
  // Stable across processes, sessions and packet changes. An uncertain attempt
  // cannot get a new dispatch slot just by replacing its plan or token.
  return `financial-reset/${packet.operation.operationId}/zero-approval/${kind}`;
}

export function approvalRequest(packet) {
  assertApprovalPacket(packet);
  return Object.freeze({ url: `https://${packet.operation.projectRef}.supabase.co/rest/v1/rpc/approve_financial_reset_zero_plan`,
    method: 'POST', body: canonicalJson({ p_operation_id: packet.operation.operationId, p_review_sha256: packet.databaseBinding.zeroReviewSha256 }) });
}
