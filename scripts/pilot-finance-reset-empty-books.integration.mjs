// Genuine local Auth/PostgREST proof only. Never accepts a host URL, database URL,
// customer packet or credentials. It does not call or unlock hosted dispatch.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS, prepareOperatorPacket, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { TRANSPORT_SOURCE_FILES, ledgerExpression, digestJson, sortDescriptors, hostedBinding, observationSql, mutationSql, jsonSql, literal, validateArtifacts } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { verifyHostedResetExecutionReadback } from './pilot-finance-reset-hosted-transport.mjs';
import { localRecoveryDocker } from './local-recovery-docker.mjs';

const root = path.resolve(import.meta.dirname, '..');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const dockerId = /^[a-f0-9]{64}$/;
const label = 'nestory.empty-books.run';
const databaseFailureNames = new Set([
  'financial_reset_actor_authorization_consumed','financial_reset_zero_independent_approval_required',
  'financial_reset_zero_session_endorsement_required','financial_reset_actor_session_required',
  'financial_reset_actor_authority_required','financial_reset_actor_binding_invalid','financial_reset_hosted_binding_invalid',
  'financial_reset_hosted_source_changed','financial_reset_recovery_phase_binding_invalid',
  'financial_reset_empty_restart_review_required','financial_reset_claim_free_operator_required',
]);
export function assertSyntheticDescriptor(d) {
  assert.deepEqual(Object.keys(d).sort(), ['runId','database','dbContainer','httpContainer','authContainer','restContainer','networkId','authUrl','restUrl'].sort());
  assert.match(d.runId, uuid);
  assert.equal(d.database, `pilot_reset_empty_books_${d.runId}`);
  for (const key of ['dbContainer','httpContainer','authContainer','restContainer','networkId']) assert.match(d[key], dockerId);
  assert.equal(new Set([d.dbContainer,d.httpContainer,d.authContainer,d.restContainer]).size,4);
  for (const [key, port] of [['authUrl','9999'],['restUrl','3000']]) {
    const u = new URL(d[key]);
    assert.equal(u.protocol, 'http:'); assert.equal(u.port, port);
    assert.match(u.hostname, /^[a-z][a-z0-9-]{0,62}$/);
    assert.equal(u.username + u.password + u.search + u.hash, ''); assert.equal(u.pathname, '/');
  }
  return d;
}

function execute(executable,args,input = '',options = {}) {
  const result = spawnSync(executable, args, { input, env:options.env, encoding:'utf8', windowsHide:true, maxBuffer:64*1024*1024, timeout:180000 });
  // HTTP command stderr is never returned: it could contain session credentials.
  if (result.error || result.status !== 0) {
    const candidate=args.includes('psql') ? /(?:ERROR|FATAL):\s+([a-z_]+)\s*(?:\r?\n|$)/.exec(result.stderr ?? '')?.[1] : null;
    throw Error(databaseFailureNames.has(candidate)?candidate:'synthetic_command_failed');
  }
  return result.stdout;
}
export function assertOwnedRuntime(d, inspect) {
  assertSyntheticDescriptor(d);
  const net = inspect.network;
  assert.equal(net.Id, d.networkId); assert.equal(net.Internal, true); assert.equal(net.Labels?.[label], d.runId);
  assert.equal(inspect.members.length,4);
  assert.deepEqual(inspect.members.map(c=>c.Id).sort(),Object.keys(net.Containers).sort());
  assert.deepEqual(inspect.members.map(c=>c.Id).sort(),[d.dbContainer,d.httpContainer,d.authContainer,d.restContainer].sort());
  for (const c of inspect.members) {
    assert.equal(c.Config.Labels?.[label], d.runId); assert.equal(c.State.Running, true);
    assert.deepEqual(c.HostConfig.PortBindings ?? {}, {});
    assert.equal((c.Mounts ?? []).some(m => m.Type === 'bind' || m.Type === 'volume'), false);
    assert.equal(Object.values(c.NetworkSettings.Networks).length, 1);
    assert.equal(Object.values(c.NetworkSettings.Networks)[0].NetworkID, d.networkId);
  }
  for (const [endpoint,id] of [[d.authUrl,d.authContainer],[d.restUrl,d.restContainer]]) {
    const hostname=new URL(endpoint).hostname;
    assert.equal(inspect.members.filter(c=>Object.values(c.NetworkSettings.Networks)[0].Aliases?.includes(hostname)).length,1);
    assert.ok(Object.values(inspect.members.find(c=>c.Id===id).NetworkSettings.Networks)[0].Aliases?.includes(hostname));
  }
  const databaseAliases=Object.values(inspect.members.find(c=>c.Id===d.dbContainer).NetworkSettings.Networks)[0].Aliases ?? [];
  for (const [id,key,role] of [[d.authContainer,'GOTRUE_DB_DATABASE_URL','supabase_auth_admin'],[d.restContainer,'PGRST_DB_URI','authenticator']]) {
    const env=inspect.members.find(c=>c.Id===id).Config.Env ?? [];
    const matches=env.filter(value=>value.startsWith(`${key}=`));assert.equal(matches.length,1);
    // Inspect only parsed non-secret binding fields; never print connection URLs.
    let connection;try { connection=new URL(matches[0].slice(key.length+1)); } catch { throw Error('synthetic_service_database_binding_invalid'); }
    assert.ok(['postgres:','postgresql:'].includes(connection.protocol)); assert.ok(databaseAliases.includes(connection.hostname));
    assert.ok(['','5432'].includes(connection.port));assert.equal(decodeURIComponent(connection.pathname),`/${d.database}`);
    assert.equal(connection.username,role);
  }
  return true;
}

async function adapter(d) {
  const {docker:command} = await localRecoveryDocker({execute});
  const inspect = () => {
    const network=JSON.parse(command(['network','inspect',d.networkId]))[0];
    return assertOwnedRuntime(d,{network,members:JSON.parse(command(['inspect',...Object.keys(network.Containers ?? {})]))});
  };
  const sql = (text, variables = {}) => {
    inspect();
    const out = command(['exec','-i',d.dbContainer,'psql','-X','-qAt','-U','postgres','-d',d.database,
      '-v','ON_ERROR_STOP=1',...Object.entries(variables).flatMap(([k,v])=>['-v',`${k}=${v}`])], text);
    return out.split(/\r?\n/).filter(line=>line.startsWith('{') || line.startsWith('[')).map(line=>JSON.parse(line));
  };
  const http = async (url, body, token = null, method = 'POST') => {
    inspect();
    const payload = {url,body,token,method};
    const script = `const p=${JSON.stringify(payload)};const r=await fetch(p.url,{method:p.method,headers:{'Content-Type':'application/json',...(p.token?{Authorization:'Bearer '+p.token}:{})},...(p.method==='GET'?{}:{body:JSON.stringify(p.body)})});const t=await r.text();console.log(JSON.stringify({status:r.status,text:t}));`;
    const result = JSON.parse(command(['exec','-i',d.httpContainer,'node','--input-type=module'],script));
    if (result.status < 200 || result.status >= 300) {
      let code = 'unknown'; try { const error=JSON.parse(result.text); code=error.code ?? error.error_code ?? 'unknown'; } catch {}
      throw Error(`synthetic_http_${result.status}_${code}`);
    }
    return result.text ? JSON.parse(result.text) : null;
  };
  return { inspect, sql, http };
}

function preparedArtifacts(f, observation, head) {
  const schema = digestJson(sortDescriptors(observation.catalog)), ledger = digestJson(observation.ledger);
  const operation = {...f.operation_binding,schema_sha256:schema};
  const artifacts = {
    manifest:{manifest_sha256:operation.manifest_sha256,source_snapshot_sha256:f.binding.source_snapshot_sha256,schema_sha256:schema,ledger_sha256:ledger},
    actions:{operation,actions:f.actions}, archive:f.archive_rows, zeroPlan:f.zero_plan, zeroPlanText:f.zero_plan_text,
    continuationPlan:f.binding.continuation_semantic, reportPlan:{report_review_sha256:f.binding.report_review_sha256},
  };
  const bytes = Object.fromEntries(Object.entries(artifacts).filter(([key])=>key!=='zeroPlanText')
    .map(([key,value])=>[key,key==='zeroPlan'?f.zero_plan_text:JSON.stringify(value)]));
  const names = [...new Set([...SOURCE_ENTRYPOINTS,...TRANSPORT_SOURCE_FILES])].sort();
  const sources = names.map(name=>({path:name,sha256:hashSourceBytes(readFileSync(path.join(root,name)))}));
  const review = {format:'nestory-protected-reset-review-v1',operation:{operationId:f.operation,projectRef:'syntheticprojectrefa',organizationId:f.organization,
    mainSha:head,sourceGeneration:0,targetGeneration:1,cutoff:'2026-10-01',issueDate:'2026-10-01',timezone:f.binding.timezone,
    executionBusinessDate:f.binding.execution_business_date,invoiceDatePolicy:'empty-books-no-invoices'},
    schemaSha256:schema,ledgerSha256:ledger,sourceSnapshotSha256:f.binding.source_snapshot_sha256,archiveRows:f.archive_rows.length,actionCount:f.actions.length,
    databaseBinding:{manifestSha256:operation.manifest_sha256,planSha256:operation.plan_sha256,archiveSha256:operation.archive_sha256,
      actionSha256:operation.action_sha256,zeroReviewSha256:f.binding.zero_review_sha256,continuationSemanticSha256:f.binding.continuation_semantic_sha256,
      reportReviewSha256:f.binding.report_review_sha256},
    artifacts:Object.fromEntries(REQUIRED_ARTIFACTS.map(key=>[key,bytes[key]===undefined?null:hashBytes(bytes[key])]))};
  // Missing hosted approvals/recovery/storage evidence remain explicit blockers.
  // These bytes are synthetic plaintext; this is not protected artifact custody.
  const packet = prepareOperatorPacket({review,sources,artifacts:bytes,candidateHead:head});
  validateArtifacts(packet,artifacts);
  return {packet,artifacts,binding:hostedBinding(packet,artifacts.continuationPlan)};
}

function recoveryReview(io, context, fixture) {
  const {packet,artifacts} = context;
  const op = literal(fixture.operation);
  const captured = io.sql(`BEGIN READ ONLY; SET LOCAL timezone='UTC';
    WITH candidates AS (SELECT app_private.financial_reset_recovery_candidates(${op}::uuid) AS value)
    SELECT jsonb_build_object('phaseBinding',jsonb_build_object('schema_sha256',${literal(packet.schemaSha256)},
      'zero_review_sha256',z.review_sha256,'zero_authority_sha256',z.result_json->>'authority_sha256',
      'continuation_review_sha256',c.review_sha256,'continuation_before_sha256',c.result_json->>'before_sha256',
      'continuation_after_sha256',c.result_json->>'after_sha256','report_checkpoint_sha256',r.checkpoint_sha256,
      'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(z.organization_id)),
      'sources_sha256',app_private.financial_reset_hash(candidates.value)),
      'sources',(SELECT jsonb_agg(jsonb_build_object('relation_name',s->>'relation_name','primary_key',s->'primary_key',
        'kind',s->>'kind','before_row_text',(s->'before_row')::text,'before_sha256',s->>'before_sha256',
        'after_row_text',nullif(s->'after_row','null'::jsonb)::text,'after_sha256',s->>'after_sha256','changed_columns','[]'::jsonb)
        ORDER BY s->>'relation_name',(s->'primary_key')::text) FROM jsonb_array_elements(candidates.value) s),
      'archive',(SELECT CASE WHEN row_json ? 'financial_generation' THEN jsonb_set(row_json,'{financial_generation}','2') ELSE row_json END::text
        FROM app_private.financial_reset_archive_rows WHERE operation_id=${op}::uuid))
    FROM candidates,app_private.financial_reset_zero_plans z JOIN app_private.financial_reset_continuation_plans c USING(operation_id,organization_id)
      JOIN app_private.financial_reset_verification_checkpoints r USING(operation_id,organization_id)
    WHERE z.operation_id=${op}::uuid; COMMIT;`).at(-1);
  // This small fixture has only zero authority and a zero owner period. Refuse
  // any additional relation rather than guess a recovery order for new data.
  const order = ['public.owner_balance_period_components','public.owner_balance_periods',
    'public.owner_opening_balance_entries','public.owner_opening_balance_requests'];
  assert.ok(captured.sources.length > 0);
  for (const source of captured.sources) {
    assert.ok(order.includes(source.relation_name)); assert.equal(source.kind,'recovery-prune');
    assert.equal(source.after_row_text,null); assert.equal(source.after_sha256,null);
  }
  const actions = captured.sources.sort((a,b)=>order.indexOf(a.relation_name)-order.indexOf(b.relation_name))
    .map((source,index)=>({...source,action_id:randomUUID(),ordinal:index+1}));
  const archived = fixture.archive_rows[0];
  const columns = io.sql(`SELECT jsonb_build_object('columns',jsonb_agg(attname ORDER BY attnum)) FROM pg_attribute
    WHERE attrelid='public.financial_month_locks'::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='';`).at(-1).columns;
  actions.push({action_id:randomUUID(),ordinal:actions.length+1,relation_name:archived.relation_name,primary_key:archived.primary_key,
    kind:'restore',before_row_text:null,before_sha256:null,after_row_text:captured.archive,after_sha256:hashBytes(captured.archive),
    changed_columns:[],insert_columns:columns});
  const digests = io.sql(`SELECT jsonb_build_object('phase',app_private.financial_reset_hash(${jsonSql(captured.phaseBinding)}),
    'actions',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('action_id',a->'action_id','ordinal',a->'ordinal',
      'relation_name',a->'relation_name','primary_key',a->'primary_key','kind',a->'kind','before_sha256',a->'before_sha256',
      'after_sha256',a->'after_sha256') ORDER BY (a->>'ordinal')::integer)) FROM jsonb_array_elements(${jsonSql(actions)}) a),
    'timestamp',clock_timestamp(),'businessDate',app_private.rent_business_date(${literal(fixture.organization)}::uuid,statement_timestamp()));`).at(-1);
  const operation = {...artifacts.actions.operation,operation_id:randomUUID(),operation_kind:'restore',restore_of:fixture.operation,
    source_generation:1,target_generation:2,plan_sha256:digestJson(actions),action_sha256:digests.actions,action_count:actions.length,audit_timestamp:digests.timestamp};
  const review = {operation,actions,phaseBinding:captured.phaseBinding,phaseBindingSha256:digests.phase,executionBusinessDate:digests.businessDate};
  const recovery = {review,artifactSha256:digestJson(review)};
  validateArtifacts(packet,artifacts,recovery);
  return recovery;
}

export async function runSyntheticEmptyBooks(d) {
  assertSyntheticDescriptor(d);
  const io = await adapter(d); io.inspect();
  const preflight = io.sql(`SELECT jsonb_build_object('database',current_database(),'claims',auth.uid(),
    'users',(SELECT count(*) FROM auth.users),'organizations',(SELECT count(*) FROM public.organizations),'ledger',${ledgerExpression});`)[0];
  assert.equal(preflight.database,d.database); assert.equal(preflight.claims,null);
  assert.equal(preflight.users,0); assert.equal(preflight.organizations,0);
  assert.ok(preflight.ledger.length>0,'Exact executed local migration ledger is required before creating test identities.');
  const signIn = async role => {
    const credentials = {email:`empty-books-${role}-${d.runId}@example.invalid`,password:randomBytes(24).toString('base64url')};
    await io.http(`${d.authUrl}/signup`,credentials);
    const session = await io.http(`${d.authUrl}/token?grant_type=password`,credentials);
    assert.equal(typeof session.access_token,'string');
    const user = await io.http(`${d.authUrl}/user`,null,session.access_token,'GET');
    assert.equal(user.id,session.user.id);
    // Session ID is read only from the genuine issuer's token; PostgreSQL checks
    // its real Auth session and PostgREST verifies the signature on every RPC.
    const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString('utf8'));
    assert.equal(claims.sub,user.id); assert.match(claims.session_id,uuid);
    return {id:user.id,sessionId:claims.session_id,token:session.access_token};
  };
  const maker = await signIn('maker'), reviewer = await signIn('reviewer');
  const f = io.sql(readFileSync(path.join(root,'scripts/fixtures/pilot-finance-reset-empty-books-http-setup.sql'),'utf8'),
    {http_maker:maker.id,http_reviewer:reviewer.id,http_session:maker.sessionId}).at(-1);
  const initial = io.sql(observationSql(null,f.binding)).at(-1);
  const head = spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim();
  assert.match(head,/^[a-f0-9]{40}$/);
  const context = preparedArtifacts(f,initial,head);
  const {packet,artifacts,binding} = context;
  const rpc = (name,body,actor=maker) => io.http(`${d.restUrl}/rpc/${name}`,body,actor.token);
  const authoritySha256 = hashBytes(`synthetic-local-proof:${d.runId}`);
  const receipts = [];
  const perform = async (action, currentBinding=binding, recovery=null) => {
    const authorizationId = await rpc('authorize_financial_reset_hosted_action',{p_binding:currentBinding,p_action:action});
    assert.match(authorizationId,uuid);
    const observation = io.sql(observationSql(packet,currentBinding,authorizationId,action)).at(-1);
    io.sql(mutationSql({binding:currentBinding,action,authorizationId,authoritySha256,observation,artifacts,recovery}));
    const after = io.sql(observationSql(packet,currentBinding,authorizationId,action)).at(-1);
    assert.equal(after.authorization.status,'consumed');
    assert.equal(after.authorization.actorId,maker.id);
    assert.equal(after.foreignSha256,initial.foreignSha256);
    assert.equal(after.control.status,'frozen');
    if (action==='freeze') assert.throws(()=>io.sql(mutationSql({binding:currentBinding,action,authorizationId,authoritySha256,observation,artifacts,recovery})),
      /financial_reset_actor_authorization_consumed/,'A real consumed authorization cannot be replayed.');
    if (action==='execute' || action==='execute-recovery') assert.equal(verifyHostedResetExecutionReadback({packet,binding:currentBinding,artifacts,recovery,
      observation:after,authorizationId,action}),true,'Production readback verifier must accept real committed state.');
    receipts.push({action,authorizationConsumed:true,frozen:true,foreignUnchanged:true});
    return after;
  };
  for (const action of ['freeze','checkpoint','prepare','seal']) await perform(action);
  await rpc('approve_financial_reset_zero_plan',{p_operation_id:f.operation,p_review_sha256:binding.zero_review_sha256});
  const deniedAuthorization = await rpc('authorize_financial_reset_hosted_action',{p_binding:binding,p_action:'execute'});
  const deniedBefore = io.sql(observationSql(packet,binding,deniedAuthorization,'execute')).at(-1);
  assert.throws(()=>io.sql(mutationSql({binding,action:'execute',authorizationId:deniedAuthorization,authoritySha256,
    observation:deniedBefore,artifacts,recovery:null})),/financial_reset_zero_(?:independent_approval|session_endorsement)_required/);
  const deniedAfter = io.sql(observationSql(packet,binding,deniedAuthorization,'execute')).at(-1);
  assert.equal(deniedAfter.authorization.status,'pending'); assert.equal(deniedAfter.operation.status,'sealed');
  assert.equal(deniedAfter.appliedCount,0); assert.equal(deniedAfter.sourceSha256,deniedBefore.sourceSha256);
  await rpc('approve_financial_reset_zero_plan',{p_operation_id:f.operation,p_review_sha256:binding.zero_review_sha256},reviewer);
  const executed = await perform('execute');
  assert.equal(executed.emptyBooks.tenantInvoices,0); assert.equal(executed.emptyBooks.ownerInvoices,0);
  assert.equal(executed.continuation.unchanged,true); assert.equal(executed.checkpoint.result.close_ready,false);
  assert.equal(executed.checkpoint.result.billing_complete,false);
  const recovery = recoveryReview(io,context,f);
  const recoveryBinding = hostedBinding(packet,artifacts.continuationPlan,recovery);
  await perform('prepare-recovery',recoveryBinding,recovery);
  const restored = await perform('execute-recovery',recoveryBinding,recovery);
  assert.equal(restored.checkpoint.kind,'phase-recovery'); assert.equal(restored.control.generation,2);
  assert.equal(restored.checkpoint.result.archive_rows_verified,true); assert.equal(restored.checkpoint.result.phase_rows_verified,true);
  assert.equal(restored.checkpoint.result.control_reopened,false);
  return {format:'nestory-synthetic-empty-books-http-proof-v1',syntheticOnly:true,hostedReadiness:false,
    actualResetRecoveryProven:false,sourceKind:'synthetic-month-lock-and-owner-scope',contractRoster:0,
    mainSha:head,sourcesSha256:packet.sourcesSha256,packetSha256:packet.packetSha256,schemaSha256:packet.schemaSha256,
    ledgerSha256:packet.ledgerSha256,migrationCount:preflight.ledger.length,
    harnessSha256:hashSourceBytes(readFileSync(fileURLToPath(import.meta.url))),
    fixtureSha256:hashSourceBytes(readFileSync(path.join(root,'scripts/fixtures/pilot-finance-reset-empty-books-http-setup.sql'))),
    genuineHttpActors:2,resetCommitted:true,syntheticInverseCommitted:true,productionReadbackVerified:true,
    consumedReplayDenied:true,independentApprovalRollbackVerified:true,receipts,
    reportCheckpointSha256:executed.checkpoint.sha256,recoveryCheckpointSha256:restored.checkpoint.sha256,
    remainingBoundary:'hosted-provider-custody-customer-recovery-and-native-adapter-not-certified'};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length,3,'Supply only an owned disposable runtime descriptor file.');
    const proof = await runSyntheticEmptyBooks(JSON.parse(readFileSync(process.argv[2],'utf8')));
    console.log(JSON.stringify(proof,null,2));
  } catch { console.error('Synthetic empty-books proof failed; no success evidence was issued.'); process.exitCode=1; }
}
