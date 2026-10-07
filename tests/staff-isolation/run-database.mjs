import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { freemem } from 'node:os';
import { summarizeTap } from './tap-result.mjs';



const root = process.cwd();
const project = `nestory-staff-oct7-task10-${Date.now()}`;
const source = 'supabase_db_nestory-restricted-task10-20261002';
const names = [];
let networkRequested = false;
const evidence = { project, started: new Date().toISOString(), results: [], services: [], errors: [] };
const password = randomBytes(24).toString('hex');
function run(args, input, allowFailure=false) {
  const r = spawnSync('docker', args, { input, encoding:'utf8', maxBuffer:64*1024*1024, timeout:120_000 });
  if (r.status !== 0 && !allowFailure) throw new Error(`docker ${args[0]} failed: ${(r.error?.message || r.stderr || '').replaceAll(password,'[local-secret]').slice(0,1000)}`);
  return r;
}
function disk() {
  const r = spawnSync('powershell', ['-NoProfile','-Command','(Get-PSDrive C).Free'], {encoding:'utf8',timeout:15_000});
  const free = Number(r.stdout.trim());
  evidence.freeBytes = free;
  if (!Number.isFinite(free) || free < 8*1024**3) throw new Error('C free space below 8 GiB or unavailable');
}
function launch(suffix,image,env={},port,containerPort,extra=[]) {
  disk();
  const name = `${project}-${suffix}`;
  const args = ['run','-d','--pull=never','--name',name,'--label',`nestory.synthetic.project=${project}`,'--network',project,'--network-alias',suffix,'--memory',suffix==='db'?'768m':suffix==='storage'?'384m':'192m'];
  if (port) args.push('-p',`127.0.0.1:${port}:${containerPort}`);
  for(const [k,v] of Object.entries(env)) args.push('-e',`${k}=${v}`);
  args.push(...extra,image);
  names.push(name);
  run(args);
  evidence.services.push({name,image,port:port||null});
  console.log(`Started ${suffix}`);
  return name;
}
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
function sql(db,text) { return run(['exec','-i',db,'psql','-U','supabase_admin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'],text).stdout; }
function cleanupOwned(kind, name) {
  try {
    const inspection = run(kind === 'network' ? ['network','inspect',name] : ['inspect',name],undefined,true);
    if (inspection.status !== 0) throw new Error('ownership inspection failed');
    const resource = JSON.parse(inspection.stdout)[0];
    const labels = kind === 'network' ? resource.Labels : resource.Config.Labels;
    if (labels?.['nestory.synthetic.project'] !== project) throw new Error('ownership label did not match; resource was not removed');
    const removal = run(kind === 'network' ? ['network','rm',name] : ['rm','-f',name],undefined,true);
    if (removal.status !== 0) throw new Error('removal failed');
  } catch (error) {
    evidence.errors.push(`Cleanup ${kind} ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}
try {
  disk();
  evidence.freeMemoryBytes = freemem();
  if (evidence.freeMemoryBytes < 2*1024**3) throw new Error("Free RAM below 2 GiB; resource guard stopped before database creation");
  const counts = run(['exec',source,'psql','-U','postgres','-d','postgres','-X','-At','-c','SELECT (SELECT count(*) FROM auth.users)||\'|\'||(SELECT count(*) FROM public.organizations)']).stdout.trim();
  if(counts !== '0|0') throw new Error('Snapshot source is not empty synthetic database');
  const inspect = JSON.parse(run(['inspect',source]).stdout)[0];
  if(inspect.Config.Labels['com.supabase.cli.project'] !== 'nestory-restricted-task10-20261002') throw new Error('Source project identity mismatch');
  networkRequested = true;
  run(['network','create','--label',`nestory.synthetic.project=${project}`,project]);
  const db = launch('db',inspect.Config.Image,{POSTGRES_PASSWORD:password},null,null);
  let ready=false;
  for(let i=0;i<45;i++) { if(run(['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,true).status===0){await sleep(3000); if(run(['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,true).status===0){ready=true;break}} await sleep(1000); }
  if(!ready) throw new Error('New database initialization unavailable');
  const sourceRoles=JSON.parse(run(['exec',source,'psql','-U','postgres','-d','postgres','-X','-At','-c',"SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'bypass',rolbypassrls)) FROM pg_roles WHERE rolname NOT LIKE 'pg_%'"]).stdout.trim());
  const targetRoles=new Set(sql(db,'SELECT rolname FROM pg_roles;').trim().split('\n'));
  for(const role of sourceRoles) {
    if(!targetRoles.has(role.name)) {
      if(!/^[a-z_]+$/.test(role.name)) throw new Error('Unexpected role identifier');
      sql(db,`CREATE ROLE "${role.name}" ${role.login?'LOGIN':'NOLOGIN'} ${role.inherit?'INHERIT':'NOINHERIT'} ${role.super?'SUPERUSER':'NOSUPERUSER'} ${role.bypass?'BYPASSRLS':'NOBYPASSRLS'};`);
    }
  }
  sql(db,`DO $clear$ DECLARE item record; kind text; BEGIN
    FOR item IN SELECT DISTINCT r.rolname,n.nspname,d.defaclobjtype FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace LOOP
      kind:=CASE item.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' END;
      IF kind IS NOT NULL THEN EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I %s REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',item.rolname,CASE WHEN item.nspname IS NULL THEN '' ELSE format('IN SCHEMA %I',item.nspname) END,kind); END IF;
    END LOOP;
  END $clear$;`);
  const dump=run(['exec',source,'pg_dump','-U','postgres','-d','postgres','--clean','--if-exists','--no-comments']).stdout;
  sql(db,dump);
  const aclQuery=`SELECT json_agg(row_data ORDER BY row_data->>'schema',row_data->>'object') FROM (SELECT json_build_object('schema',n.nspname,'object',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',(SELECT json_agg(json_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END::"char",c.relowner))) x)) row_data FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private') AND c.relkind IN ('r','v','S')) entries;`;
  const sourceAcl=run(['exec',source,'psql','-U','postgres','-d','postgres','-X','-At','-c',aclQuery]).stdout.trim();
  const cloneAcl=sql(db,aclQuery).trim();
  evidence.sourceTableAclMatches=sourceAcl===cloneAcl;
  if(!evidence.sourceTableAclMatches){const sourceEntries=JSON.parse(sourceAcl),cloneEntries=JSON.parse(cloneAcl),byName=new Map(cloneEntries.map(x=>[x.schema+'.'+x.object,x]));evidence.aclDifferences=sourceEntries.filter(x=>JSON.stringify(x)!==JSON.stringify(byName.get(x.schema+'.'+x.object))).map(x=>x.schema+'.'+x.object);evidence.extraCloneRelations=cloneEntries.filter(x=>!sourceEntries.some(y=>y.schema===x.schema&&y.object===x.object)).map(x=>x.schema+'.'+x.object);}
  if(!evidence.sourceTableAclMatches) throw new Error('Cloned public/private relation ACLs differ from empty source; no authorization assertions run');
  const ledger=new Set(sql(db,'SELECT version FROM supabase_migrations.schema_migrations;').trim().split('\n'));
  const {readdirSync}=await import('node:fs');
  const migrationNames=readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
  evidence.baseline='164b2cf93a4974bed2ae2fe5b030263dc0efc953';
  evidence.appliedMigrations=[];
  for(const file of migrationNames){if(!ledger.has(file.split('_')[0])){const text=readFileSync(path.join(root,'supabase/migrations',file),'utf8');sql(db,text);evidence.appliedMigrations.push({file,sha256:createHash('sha256').update(text).digest('hex')});}}
  for(const suite of ['staff_two_company_branch_isolation_test.sql','staff_document_revocation_test.sql','custom_role_domain_authority_test.sql','core_domain_mutation_authority_test.sql','remaining_core_domain_mutation_authority_test.sql','remaining_branch_scope_domain_enforcement_test.sql','scoped_lease_finance_read_context_test.sql','maintenance_role_workflow_test.sql','lease_authority_contract_test.sql','granular_finance_operation_authority_test.sql']){
    const text=readFileSync(path.join(root,'supabase/tests',suite),'utf8');
    const response=run(['exec','-i',db,'psql','-U','postgres','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1'],text,true);
    const tap=summarizeTap(response.stdout);
    evidence.results.push({suite,...tap,setupBlocked:response.status!==0,exitCode:response.status});
    writeFileSync(path.join(root,'tests/staff-isolation',suite+'.log'),response.stdout+response.stderr);
    console.log(JSON.stringify(evidence.results.at(-1)));
    if (!tap.valid || response.status !== 0) process.exitCode=1;
  }
} catch(error){evidence.errors.push(error.message);console.error(error.message);process.exitCode=1;} finally {
  for(const name of names.reverse()) cleanupOwned('container',name);
  if (networkRequested) cleanupOwned('network',project);
  evidence.finished=new Date().toISOString();writeFileSync(path.join(root,'tests/staff-isolation/evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}
