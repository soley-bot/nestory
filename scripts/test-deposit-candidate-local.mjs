// Integration test against an owned, disposable database on a verified local
// Docker engine. Source database is read for schema only; its data is never copied.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { localRecoveryDocker } from './local-recovery-docker.mjs';

const packageRoot = resolve('docs/design/deposit-rent-candidate');
const fixtureRoot = resolve('scripts/fixtures/deposit-rent');
const inventory=JSON.parse(readFileSync(resolve(packageRoot,'manifest.json'),'utf8'));
for(const {file,sha256:expected} of inventory) {
  const actual=createHash('sha256').update(readFileSync(resolve(packageRoot,file))).digest('hex');
  if(actual!==String(expected).toLowerCase())throw Error(`Preserved package hash mismatch: ${file}`);
}
function execute(command,args,input,options={}) {
  const r=spawnSync(command,args,{input,encoding:'utf8',maxBuffer:80*1024*1024,timeout:120000,...options});
  if(r.status!==0) throw Error(`${command} failed: ${r.stderr?.slice(-5000) || r.error}`);
  return r.stdout;
}
const {docker}=await localRecoveryDocker({execute});
const container='supabase_db_nestory';
const db=`deposit_candidate_${Date.now()}`;
const out=resolve('artifacts/deposit-candidate');mkdirSync(out,{recursive:true});
const run={database:db,startedAt:new Date().toISOString(),completed:false,cleanedUp:false,
  harnessSha256:createHash('sha256').update(readFileSync('scripts/test-deposit-candidate-local.mjs')).digest('hex')};
writeFileSync(resolve(out,'run.json'),JSON.stringify(run,null,2));
const sql=(body,database=db)=>docker(['exec','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],body);
const results=[];
let created=false;
const check=(name,body,expected)=>{try{const actual=sql(body).trim();if(expected && actual!==expected)throw Error(`Expected ${expected}, got ${actual}`);results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});throw e;}};
try {
  await docker(['exec',container,'createdb','-U','supabase_admin','-O','postgres',db]);
  created=true;
  const schema=await docker(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--exclude-schema=supabase_migrations','--exclude-extension=pg_cron','--exclude-schema=cron']);
  await sql(schema);
  // Schema-only dumps omit runtime capability rows. Generate new test-only
  // values; never read or copy the source database's private capability values.
  for (const table of ['finance_settlement_context_capability','financial_projection_context_capability',
    'tenant_invoice_settlement_context_capability','finance_branch_authority_capability']) {
    await sql(`INSERT INTO app_private.${table}(singleton,capability_token) VALUES(true,encode(extensions.gen_random_bytes(32),'hex'))`);
  }
  const version=(await sql('SELECT max(version) FROM supabase_migrations.schema_migrations','postgres')).trim();
  for(const file of readdirSync('supabase/migrations').sort()) if(file.slice(0,14)>version) await sql('SET ROLE postgres;\n'+readFileSync(resolve('supabase/migrations',file),'utf8'));
  // No unpublished deposit tables are required to install the new reader.
  check('reader installs on current main without deposit schema',"SELECT to_regprocedure('public.get_deposit_statement_source(uuid,uuid,uuid,uuid,text)') IS NOT NULL",'t');
  for(const {file} of inventory) await sql('SET ROLE postgres;\n'+readFileSync(resolve(packageRoot,file),'utf8'));
  results.push({name:'all preserved SQL companions compile against current local main schema',pass:true});
  await sql(readFileSync(resolve(fixtureRoot,'base.sql'),'utf8'));
  await sql(`INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000023','leases.view') ON CONFLICT DO NOTHING`);
  // Reuse only fixture setup helpers, never the historical worker's runtime or resources.
  const helper=readFileSync(resolve(fixtureRoot,'seed-body.txt'),'utf8');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const q=n=>`'${id(n)}'`;
  const syncSql=body=>{try{return {code:0,out:sql(body).trim(),err:''};}catch(e){return {code:1,out:'',err:e.message};}};
  const actor=(n,body,commit=false)=>`BEGIN; SET LOCAL "request.jwt.claim.sub" = ${q(n)}; ${body}; ${commit?'COMMIT':'ROLLBACK'};`;
  // All helpers operate only on this newly created synthetic database.
  const seed=new Function('sql','admin','actor','q','id',`${helper}; return seed;`)(syncSql,body=>sql(body),actor,q,id);
  seed(2000);
  await sql(actor(101,`SELECT public.apply_deposit_to_rent(${q(1)},${q(2002)},${q(2003)},'2026-10-04','[{"lineId":"${id(2005)}","amount":"100.00"}]','Synthetic application','reader-test-apply')`,true));
  const app=JSON.parse(sql("SELECT jsonb_build_object('id',a.id,'fingerprint',app_private.deposit_rent_owner_fingerprint(a.organization_id,a.id)) FROM public.deposit_rent_applications a").trim());
  check('partial application leaves 400 deposit and 400 unpaid rent',`SELECT app_private.deposit_rent_held(${q(1)},${q(2002)})=400 AND (SELECT balance_due=400 FROM public.tenant_invoice_balances WHERE id=${q(2003)})`,'t');
  check('application creates no tenant cash payment', 'SELECT count(*) FROM public.tenant_invoice_payments','0');
  check('same-key application returns original identity',actor(101,`SELECT public.apply_deposit_to_rent(${q(1)},${q(2002)},${q(2003)},'2026-10-04','[{"lineId":"${id(2005)}","amount":"100.00"}]','Synthetic application','reader-test-apply')`),app.id);
  check('same-key application creates only one financial application','SELECT count(*) FROM public.deposit_rent_applications','1');
  const call=(overrides={})=>`SELECT public.get_deposit_statement_source('${overrides.org??id(1)}','${overrides.property??id(31)}','${overrides.owner??id(42)}','${overrides.app??app.id}','${overrides.fingerprint??app.fingerprint}')`;
  const auth=(who,body)=>actor(who,'SET LOCAL ROLE authenticated; '+body);
  const denied=(name,body,code)=>{let error;try{sql(body);}catch(e){error=e.message;}if(!error?.includes(code))throw Error(`${name}: expected ${code}, got ${error??'success'}`);results.push({name,pass:true});};
  check('finance-only ordinary role reads exact display projection',auth(102,`SELECT (${call().replace('SELECT ','')}->>'applicationId')='${app.id}'`),'t');
  const packet=JSON.parse(sql(auth(102,call())).trim().split('\n').at(-1));
  if(packet.sourceFingerprint!==app.fingerprint||packet.leaseId!==id(2000)||packet.operation!=='apply')throw Error('Projection mismatch');
  writeFileSync(resolve(out,'ordinary-role-packet.json'),JSON.stringify(packet,null,2));
  for(const who of [103,104,105])denied(`role or branch denied ${who}`,auth(who,call()),'42501');
  denied('foreign organization denied',auth(102,call({org:id(2)})),'42501');
  denied('wrong owner denied',auth(102,call({owner:id(41)})),'23514');
  denied('changed fingerprint denied',auth(102,call({fingerprint:'f'.repeat(64)})),'23514');
  denied('anonymous execute denied',`BEGIN; SET LOCAL ROLE anon; ${call()}; ROLLBACK;`,'42501');
  denied('service role execute denied',`BEGIN; SET LOCAL ROLE service_role; ${call()}; ROLLBACK;`,'42501');
  denied('direct application table denied',auth(102,'SELECT * FROM public.deposit_rent_applications'),'42501');
  check('deposit write command remains ungranted',"SELECT NOT has_function_privilege('authenticated','public.apply_deposit_to_rent(uuid,uuid,uuid,date,jsonb,text,text)','EXECUTE')",'t');
  const mutateThenRead=change=>`BEGIN; SET LOCAL session_replication_role=replica; ${change}; SET LOCAL session_replication_role=origin; SET LOCAL "request.jwt.claim.sub"=${q(102)}; SET LOCAL ROLE authenticated; ${call()}; ROLLBACK;`;
  denied('revoked finance permission takes effect',mutateThenRead(`DELETE FROM public.organization_role_permissions WHERE role_id=${q(22)} AND permission_key='finance.view'`),'42501');
  denied('changed lease parent fails closed',mutateThenRead(`UPDATE public.leases SET property_id=${q(32)} WHERE id=${q(2000)}`),'23514');
  denied('changed invoice property fails closed',mutateThenRead(`UPDATE public.tenant_invoices SET property_id=${q(32)} WHERE id=${q(2003)}`),'23514');
  denied('missing authoritative bridge fails closed',mutateThenRead(`DELETE FROM public.deposit_rent_owner_bridges WHERE application_id='${app.id}'`),'23514');
  await sql(actor(101,`SELECT public.reverse_deposit_rent_application(${q(1)},'${app.id}','2026-10-05','Synthetic reversal','reader-test-reversal')`,true));
  const reversed=JSON.parse(sql(`SELECT jsonb_build_object('id',a.id,'fingerprint',app_private.deposit_rent_owner_fingerprint(a.organization_id,a.id)) FROM public.deposit_rent_applications a WHERE reversal_of_application_id='${app.id}'`).trim());
  const reversalPacket=JSON.parse(sql(auth(102,call({app:reversed.id,fingerprint:reversed.fingerprint}))).trim());
  if(reversalPacket.operation!=='full-reversal'||reversalPacket.originalApplicationId!==app.id||reversalPacket.leaseId!==id(2000))throw Error('Reversal lineage mismatch');
  results.push({name:'ordinary finance role reads actual command-created full reversal',pass:true});
  check('full reversal restores deposit and invoice to 500',`SELECT app_private.deposit_rent_held(${q(1)},${q(2002)})=500 AND (SELECT balance_due=500 FROM public.tenant_invoice_balances WHERE id=${q(2003)})`,'t');
  check('reversal creates no tenant cash payment','SELECT count(*) FROM public.tenant_invoice_payments','0');
  // The following grants exist only in this process-owned synthetic database.
  // Source container database and production permissions remain unchanged.
  await sql(`INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key) VALUES(${q(1)},${q(21)},'leases.view') ON CONFLICT DO NOTHING;
    GRANT EXECUTE ON FUNCTION public.get_local_deposit_rent_candidates(uuid,uuid),public.get_deposit_rent_journal(uuid,uuid),public.prepare_deposit_rent_journal(uuid,uuid,jsonb,text),public.begin_deposit_rent_journal_attempt(uuid,uuid,uuid,uuid,text,integer),public.execute_deposit_rent_journal(uuid,uuid,uuid,uuid,text) TO authenticated;`);
  seed(3000);
  const readJournal=`SELECT public.get_deposit_rent_journal(${q(1)},${q(3000)})`;
  for(const who of [102,103,104,105])denied(`journal read requires dual scope for actor ${who}`,auth(who,readJournal),'42501');
  const candidates=JSON.parse(sql(auth(101,`SELECT public.get_local_deposit_rent_candidates(${q(1)},${q(3000)})`)).trim());
  const payload={operation:'apply',leaseId:id(3000),date:'2026-10-04',reason:'Synthetic partial rent',depositId:id(3002),invoiceId:id(3003),lineId:id(3005),amount:'100.00'};
  const prepare=`SELECT public.prepare_deposit_rent_journal(${q(1)},${q(3000)},'${JSON.stringify(payload)}','${candidates.fingerprint}')`;
  const revokeThenCall=(permission,command)=>`BEGIN; SET LOCAL session_replication_role=replica; DELETE FROM public.organization_role_permissions WHERE role_id=${q(21)} AND permission_key='${permission}'; SET LOCAL session_replication_role=origin; SET LOCAL "request.jwt.claim.sub"=${q(101)}; SET LOCAL ROLE authenticated; ${command}; ROLLBACK;`;
  for (const permission of ['leases.view','finance.view','leases.change_terms','finance.record_payments'])
    denied(`journal prepare rechecks ${permission}`,revokeThenCall(permission,prepare),'42501');
  const intent=JSON.parse(sql(actor(101,'SET LOCAL ROLE authenticated; '+prepare,true)).trim());
  writeFileSync(resolve(out,'journal-preview.json'),JSON.stringify(intent,null,2));
  results.push({name:'ordinary authenticated role prepares durable partial application',pass:true});
  const proof=`${q(1)},${q(3000)},'${intent.token}','${intent.idempotencyKey}','${intent.payloadHash}'`;
  const started=JSON.parse(sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.begin_deposit_rent_journal_attempt(${proof},${intent.revision})`,true)).trim());
  if(started.state!=='attempted')throw Error('Durable journal attempt missing');
  const executeJournal=`SELECT public.execute_deposit_rent_journal(${proof})`;
  for (const permission of ['leases.change_terms','finance.record_payments'])
    denied(`journal execute rechecks revoked ${permission} after durable attempt`,revokeThenCall(permission,executeJournal),'42501');
  const resolved=JSON.parse(sql(actor(101,'SET LOCAL ROLE authenticated; '+executeJournal,true)).trim());
  if(resolved.state!=='resolved')throw Error('Atomic journal result missing');
  check('ordinary journal partial application settles once and preserves 400 held/unpaid',`SELECT app_private.deposit_rent_held(${q(1)},${q(3002)})=400 AND (SELECT balance_due=400 FROM public.tenant_invoice_balances WHERE id=${q(3003)})`,'t');
  const replayed=JSON.parse(sql(actor(101,'SET LOCAL ROLE authenticated; '+executeJournal,true)).trim());
  if(replayed.result.commandId!==resolved.result.commandId)throw Error('Retry changed command identity');
  check('ordinary journal retry has one application',`SELECT count(*) FROM public.deposit_rent_applications WHERE lease_deposit_id=${q(3002)}`,'1');
  denied('journal original key conflict is rejected',auth(101,`SELECT public.execute_deposit_rent_journal(${q(1)},${q(3000)},'${intent.token}',${q(9999)},'${intent.payloadHash}')`),'23514');
  const reverseCandidates=JSON.parse(sql(auth(101,`SELECT public.get_local_deposit_rent_candidates(${q(1)},${q(3000)})`)).trim());
  const reversePayload={operation:'reverse',leaseId:id(3000),date:'2026-10-05',reason:'Synthetic full reversal',applicationId:resolved.result.commandId};
  const reverseIntent=JSON.parse(sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.prepare_deposit_rent_journal(${q(1)},${q(3000)},'${JSON.stringify(reversePayload)}','${reverseCandidates.fingerprint}')`,true)).trim());
  const reverseProof=`${q(1)},${q(3000)},'${reverseIntent.token}','${reverseIntent.idempotencyKey}','${reverseIntent.payloadHash}'`;
  sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.begin_deposit_rent_journal_attempt(${reverseProof},${reverseIntent.revision})`,true));
  sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.execute_deposit_rent_journal(${reverseProof})`,true));
  check('ordinary journal full reversal restores 500 held/unpaid',`SELECT app_private.deposit_rent_held(${q(1)},${q(3002)})=500 AND (SELECT balance_due=500 FROM public.tenant_invoice_balances WHERE id=${q(3003)})`,'t');
  check('complete journal lifecycle creates no tenant cash payment','SELECT count(*) FROM public.tenant_invoice_payments','0');
  seed(4000,'through_ips',500,300,500,false);
  sql(actor(101,`SELECT public.allocate_owner_event(${q(1)},'security_deposit_receipt',${q(4006)},'owner-fixture-receipt'); SELECT public.confirm_deposit_rent_custody(${q(1)},${q(4002)},${q(81)},'owner',${q(42)},'2026-10-02',500,'Synthetic owner custody evidence','owner-fixture-custody')`,true));
  function journalCommand(lease,payload) {
    const snapshot=JSON.parse(sql(auth(101,`SELECT public.get_local_deposit_rent_candidates(${q(1)},${q(lease)})`)).trim());
    const prepared=JSON.parse(sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.prepare_deposit_rent_journal(${q(1)},${q(lease)},'${JSON.stringify(payload)}','${snapshot.fingerprint}')`,true)).trim());
    const args=`${q(1)},${q(lease)},'${prepared.token}','${prepared.idempotencyKey}','${prepared.payloadHash}'`;
    sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.begin_deposit_rent_journal_attempt(${args},${prepared.revision})`,true));
    return JSON.parse(sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.execute_deposit_rent_journal(${args})`,true)).trim());
  }
  const ownerResult=journalCommand(4000,{...payload,leaseId:id(4000),depositId:id(4002),invoiceId:id(4003),lineId:id(4005)});
  check('owner-held application leaves 400 deposit and 200 unpaid rent',`SELECT app_private.deposit_rent_held(${q(1)},${q(4002)})=400 AND (SELECT balance_due=200 FROM public.tenant_invoice_balances WHERE id=${q(4003)})`,'t');
  check('owner-held application creates no IPS-held owner cash',`SELECT NOT EXISTS(SELECT 1 FROM public.owner_component_movements m JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id JOIN public.deposit_rent_owner_bridges b ON b.organization_id=o.organization_id AND b.allocation_set_id=o.allocation_set_id WHERE b.application_id='${ownerResult.result.commandId}' AND m.component='ips_held_owner_cash' AND m.signed_amount<>0)`,'t');
  journalCommand(4000,{operation:'reverse',leaseId:id(4000),date:'2026-10-05',reason:'Synthetic owner reversal',applicationId:ownerResult.result.commandId});
  check('owner-held reversal restores 500 deposit and 300 unpaid rent',`SELECT app_private.deposit_rent_held(${q(1)},${q(4002)})=500 AND (SELECT balance_due=300 FROM public.tenant_invoice_balances WHERE id=${q(4003)})`,'t');
  seed(5000,'through_ips',500,300,600,false);
  const receipt=`SELECT public.record_lease_deposit_event_idempotent(${q(1)},${q(5002)},${q(81)},'received','2026-10-04',100,'Synthetic additional deposit receipt','candidate-receipt-once')`;
  const receiptId=sql(actor(101,'SET LOCAL ROLE authenticated; '+receipt,true)).trim();
  check('ordinary checked deposit receipt brings held balance to 600',`SELECT app_private.deposit_rent_held(${q(1)},${q(5002)})=600`,'t');
  check('ordinary deposit receipt retry returns original event',auth(101,receipt),receiptId);
  check('ordinary receipt retry does not duplicate event',`SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id=${q(5002)} AND event_type='received'`,'2');
  // Bounded report reader is separately held in production. Exercise its real
  // current permission checks and export packets only in this synthetic DB.
  sql('GRANT EXECUTE ON FUNCTION public.get_local_lease_deposit_report_snapshot(uuid,uuid[],date,date,uuid) TO authenticated');
  const snapshotCall=`SELECT public.get_local_lease_deposit_report_snapshot(${q(1)},ARRAY[${q(31)}]::uuid[],'2026-10-01','2026-10-31',NULL)`;
  for (const who of [102,103,104,105]) denied(`report snapshot requires both scoped read permissions for actor ${who}`,auth(who,snapshotCall),'42501');
  denied('report snapshot rejects mixed unauthorized property scope',auth(101,`SELECT public.get_local_lease_deposit_report_snapshot(${q(1)},ARRAY[${q(31)},${q(32)}]::uuid[],'2026-10-01','2026-10-31',NULL)`),'42501');
  const snapshot=JSON.parse(sql(auth(101,snapshotCall)).trim());
  const finance=JSON.parse(sql(auth(101,`SELECT public.get_finance_read_context(${q(1)},${q(31)})`)).trim());
  const leaseIds=(finance.recovery_leases??finance.leases).map(row=>`'${row.id}'`).join(',');
  const leases=JSON.parse(sql(auth(101,`SELECT public.get_lease_read_context(${q(1)},ARRAY[${leaseIds}]::uuid[])`)).trim());
  if(snapshot.allocations.length!==6 || snapshot.ownerBridges.length!==6) throw Error('Synthetic report omitted application or reversal evidence');
  writeFileSync(resolve(out,'report-packets.json'),JSON.stringify({
    scope:{organizationId:id(1),actorId:id(101),propertyIds:[id(31)],periodStart:'2026-10-01',periodEnd:'2026-10-31'},
    finance,leases,snapshot,
  },null,2));
  results.push({name:'ordinary report snapshot retains all six application and reversal sources',pass:true});
  // Missing schema is an explicit runtime error, not an accidental table query.
  denied('missing unpublished schema fails closed',`BEGIN; ALTER TABLE public.deposit_rent_applications RENAME TO unavailable_applications; SET LOCAL "request.jwt.claim.sub"=${q(102)}; SET LOCAL ROLE authenticated; ${call()}; ROLLBACK;`,'55000');
  run.completed=true;
  console.log(JSON.stringify(results,null,2));
} catch(error) {
  results.push({name:'complete synthetic acceptance run',pass:false,error:String(error)});
  throw error;
} finally {
  writeFileSync(resolve(out,'database-results.json'),JSON.stringify(results,null,2));
  // db was created by this process with a generated fixed-prefix identifier.
  if(created) {
    await docker(['exec',container,'dropdb','-U','supabase_admin',db]);
    run.cleanedUp=true;
  }
  writeFileSync(resolve(out,'run.json'),JSON.stringify({...run,finishedAt:new Date().toISOString()},null,2));
}
