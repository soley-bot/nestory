// Integration test against an owned, disposable database on a verified local
// Docker engine. Source database is read for schema only; its data is never copied.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { localRecoveryDocker } from './local-recovery-docker.mjs';

const packageRoot = process.env.DEPOSIT_REVIEW_PACKAGE;
const fixtureRoot = process.env.DEPOSIT_VALIDATION_FIXTURE;
if (!packageRoot || !fixtureRoot) throw Error('Set DEPOSIT_REVIEW_PACKAGE and DEPOSIT_VALIDATION_FIXTURE to the preserved local package and round16 fixture.');
const inventory=JSON.parse(readFileSync(resolve(packageRoot,'final-dormant-candidate-inventory.json'),'utf8'));
for(const [file,expected] of Object.entries(inventory.files)) {
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
const db=`deposit_reader_${Date.now()}`;
const out=resolve('artifacts/deposit-reader-access');mkdirSync(out,{recursive:true});
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
  for(const file of ['20261004160000_deposit_rent_application.sql','20261004160001_deposit_rent_owner_bridge.sql']) await sql('SET ROLE postgres;\n'+readFileSync(resolve(packageRoot,'production-readiness/forward-migrations',file),'utf8'));
  await sql(readFileSync(resolve(fixtureRoot,'fixture.sql'),'utf8'));
  // Reuse only fixture setup helpers, never the historical worker's runtime or resources.
  const setup=readFileSync(resolve(fixtureRoot,'setup.mjs'),'utf8');
  const start=setup.indexOf("if(sql(`SELECT EXISTS(SELECT 1 FROM public.organization_members");
  const end=setup.indexOf('function injectedCommand');
  if(start<0||end<start)throw Error('Preserved fixture helper boundary changed');
  const helper=setup.slice(start,end);
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const q=n=>`'${id(n)}'`;
  const syncSql=body=>{try{return {code:0,out:sql(body).trim(),err:''};}catch(e){return {code:1,out:'',err:e.message};}};
  const actor=(n,body,commit=false)=>`BEGIN; SET LOCAL "request.jwt.claim.sub" = ${q(n)}; ${body}; ${commit?'COMMIT':'ROLLBACK'};`;
  // All helpers operate only on this newly created synthetic database.
  const seed=new Function('sql','admin','actor','q','id',`${helper}; return seed;`)(syncSql,body=>sql(body),actor,q,id);
  seed(2000);
  await sql(actor(101,`SELECT public.apply_deposit_to_rent(${q(1)},${q(2002)},${q(2003)},'2026-10-04','[{"lineId":"${id(2005)}","amount":"100.00"}]','Synthetic application','reader-test-apply')`,true));
  const app=JSON.parse(sql("SELECT jsonb_build_object('id',a.id,'fingerprint',app_private.deposit_rent_owner_fingerprint(a.organization_id,a.id)) FROM public.deposit_rent_applications a").trim());
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
  // Missing schema is an explicit runtime error, not an accidental table query.
  denied('missing unpublished schema fails closed',`BEGIN; ALTER TABLE public.deposit_rent_applications RENAME TO unavailable_applications; SET LOCAL "request.jwt.claim.sub"=${q(102)}; SET LOCAL ROLE authenticated; ${call()}; ROLLBACK;`,'55000');
  console.log(JSON.stringify(results,null,2));
} finally {
  writeFileSync(resolve(out,'database-results.json'),JSON.stringify(results,null,2));
  // db was created by this process with a generated fixed-prefix identifier.
  if(created) await docker(['exec',container,'dropdb','-U','supabase_admin',db]);
}
