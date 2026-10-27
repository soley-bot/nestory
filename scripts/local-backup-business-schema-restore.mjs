// Pure schema correction classification. This does not execute definitions or
// relax the exact full-catalog check before business data restoration.
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=()=>{throw Error('local_business_schema_definition_invalid')};
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const kinds=new Set(['schema','relation','column','constraint','index','policy','function','trigger','enum','default_acl']);
function checkedDefinitions(payload){
 if(!payload||!Array.isArray(payload.catalog)||!Array.isArray(payload.definitions)||payload.catalog.length!==payload.definitions.length)fail();
 const map=new Map();
 for(let i=0;i<payload.definitions.length;i++){
  const d=payload.definitions[i],c=payload.catalog[i];
  if(!exact(d,['kind','name','definition','sha256'])||!exact(c,['kind','name','sha256'])||!kinds.has(d.kind)||typeof d.name!=='string'||typeof d.definition!=='string'||
   !/^[a-f0-9]{64}$/.test(d.sha256)||hash(d.definition)!==d.sha256||d.kind!==c.kind||d.name!==c.name||d.sha256!==c.sha256||map.has(`${d.kind}:${d.name}`))fail();
  map.set(`${d.kind}:${d.name}`,d);
 }
 return map;
}
function tuple(d){try{const t=JSON.parse(d.definition);if(!Array.isArray(t))fail();return t}catch{fail()}}
function schemaOf(d){return d.kind==='schema'?d.name:d.name.split('.')[0]}
export function classifyBusinessSchemaCorrection({source,actual}){
 const expected=checkedDefinitions(source),installed=checkedDefinitions(actual),changes=[];
 for(const key of [...new Set([...expected.keys(),...installed.keys()])].sort()){
  const e=expected.get(key),a=installed.get(key);if(e?.sha256===a?.sha256)continue;
  const d=e??a,schema=schemaOf(d);let classification='unreviewed',bodyEqual=null;
  if(!['app_private','public','auth','storage','supabase_migrations'].includes(schema)&&!(d.kind==='default_acl'&&schema==='global'))fail();
  if(e&&a&&d.kind==='function'){
   const et=tuple(e),at=tuple(a);if(et.length!==3||at.length!==3)fail();bodyEqual=et[0]===at[0];
   classification=bodyEqual?'function-permissions':(['auth','storage'].includes(schema)?'vendor-function-definition':
    typeof et[0]==='string'&&typeof at[0]==='string'&&et[0].replaceAll('\r\n','\n')===at[0].replaceAll('\r\n','\n')?'application-function-line-endings':'application-definition-change');
  }else if(e&&a&&d.kind==='relation'){
   const et=tuple(e),at=tuple(a);if(et.length!==7||at.length!==7)fail();
   bodyEqual=same(et.slice(0,4),at.slice(0,4))&&et[6]===at[6];
   classification=bodyEqual?'relation-permissions':(['auth','storage'].includes(schema)?'vendor-relation-definition':'application-definition-change');
  }else if(d.kind==='schema'&&e&&a)classification='schema-permissions';
  else if(d.kind==='default_acl')classification='default-permissions';
  else if(schema==='supabase_migrations')classification='migration-ledger-structure';
  else if(['auth','storage'].includes(schema))classification=`vendor-${d.kind}-${!e?'remove':!a?'create':'change'}`;
  else classification='application-definition-change';
  changes.push({kind:d.kind,name:d.name,classification,expectedSha256:e?.sha256??null,actualSha256:a?.sha256??null,bodyEqual});
 }
 return {format:'nestory-local-business-schema-correction-classification-v1',changes,
  unreviewedApplicationChanges:changes.filter(x=>['application-definition-change','unreviewed'].includes(x.classification)).length,
  sourceObjectCount:expected.size,installedObjectCount:installed.size,correctionExecuted:false,exactCatalogRequired:true};
}

const literal=v=>`'${String(v).replaceAll("'","''")}'`;
const emptyRuntimeGuard=`DO $local_schema_empty$ BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'postgres' OR inet_server_addr() IS NOT NULL OR current_setting('data_directory')<>'/db/pg' OR current_setting('listen_addresses')<>''
 OR EXISTS(SELECT 1 FROM public.organizations) OR EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.objects) THEN
 RAISE EXCEPTION 'local_business_schema_empty_owned_runtime_required'; END IF; END $local_schema_empty$;`;
function routineTarget(d){const o=permissionObject(d);return o.object}
function sourceCommand(text){
 // psql line input may canonicalize CRLF. Server-side decoding preserves the
 // exact captured function/definition bytes before PostgreSQL parses them.
 return `DO $local_schema_definition$ BEGIN EXECUTE convert_from(decode(${literal(Buffer.from(text,'utf8').toString('base64'))},'base64'),'UTF8'); END $local_schema_definition$;`;
}
function columnSql(d){
 const t=tuple(d),parts=d.name.split('.');if(parts.length!==3||t.length!==6||!Number.isSafeInteger(t[0])||t[0]<1||typeof t[1]!=='string'||typeof t[2]!=='boolean'||t[3]!==''||!['','s'].includes(t[4])||t[5]!==null&&typeof t[5]!=='string')fail();
 // Only the three observed stored SCIM projections may be generated columns.
 const generated={'auth.scim_users.active':"COALESCE(((resource ->> 'active'::text))::boolean, true)",'auth.scim_users.external_id':"(resource ->> 'externalId'::text)",'auth.scim_users.user_name':"lower((resource ->> 'userName'::text))"};
 if(t[4]==='s'&&generated[d.name]!==t[5]||t[4]===''&&Object.hasOwn(generated,d.name))fail();
 // Type/default text is authenticated source metadata, never caller SQL.
 if(!/^[a-zA-Z0-9_ .\[\]"]+$/.test(t[1]))fail();
 return `${identifier(parts[2])} ${t[1]}${t[4]==='s'?` GENERATED ALWAYS AS (${t[5]}) STORED`:t[5]===null?'':` DEFAULT ${t[5]}`}${t[2]?' NOT NULL':''}`;
}
const finiteNewTables=['auth.mfa_recovery_code_sets','auth.mfa_recovery_codes','auth.scim_tokens','auth.scim_users'];
const finiteOldTables=['storage.iceberg_tables','storage.iceberg_namespaces'];
const finiteAddedColumns=['auth.one_time_tokens.expires_at','storage.buckets.versioning_status','storage.buckets.lifecycle_configuration','storage.buckets.lifecycle_configuration_generation','storage.objects.archived_at','storage.objects.is_delete_marker','storage.objects.is_versioned'];
const expectedStructuralCounts={'vendor-column-create':37,'vendor-column-remove':18,'migration-ledger-structure':7,'vendor-constraint-create':23,'vendor-constraint-remove':5,
 'default-permissions':6,'vendor-enum-change':1,'application-function-line-endings':126,'function-permissions':57,'vendor-function-create':8,'vendor-function-definition':2,
 'vendor-function-remove':6,'vendor-index-create':29,'vendor-index-remove':6,'relation-permissions':96,'vendor-relation-create':4,'vendor-relation-remove':2,'schema-permissions':1,'vendor-trigger-create':3};
export function buildBusinessSchemaStructuralCorrection({source,actual}){
 const c=classifyBusinessSchemaCorrection({source,actual}),counts={};for(const d of c.changes)counts[d.classification]=(counts[d.classification]??0)+1;
 if(c.sourceObjectCount!==8229||c.installedObjectCount!==8160||JSON.stringify(Object.entries(counts).sort())!==JSON.stringify(Object.entries(expectedStructuralCounts).sort()))throw Error('local_business_schema_finite_roster_changed');
 const expected=checkedDefinitions(source),installed=checkedDefinitions(actual),lookup=(kind,name)=>expected.get(`${kind}:${name}`),statements=[],enumStatements=[];
 const newNames=c.changes.filter(x=>x.classification==='vendor-relation-create').map(x=>x.name).sort(),oldNames=c.changes.filter(x=>x.classification==='vendor-relation-remove').map(x=>x.name).sort();
 if(!same(newNames,[...finiteNewTables].sort())||!same(oldNames,[...finiteOldTables].sort()))fail();
 const sourceEnum=lookup('enum','auth.factor_type'),actualEnum=installed.get('enum:auth.factor_type');
 if(sourceEnum?.definition!=='totp,webauthn,phone,recovery_code'||actualEnum?.definition!=='totp,webauthn,phone')fail();
 enumStatements.push(`ALTER TYPE auth.factor_type ADD VALUE 'recovery_code' AFTER 'phone';`);
 // The enum transaction commits before any definitions could reference it.
 const enumSql=`BEGIN;SET LOCAL search_path=pg_catalog,public;${emptyRuntimeGuard}\n${enumStatements.join('\n')}\nCOMMIT;`;
 for(const name of finiteOldTables){
  statements.push(`DO $local_empty_vendor$ BEGIN IF EXISTS(SELECT 1 FROM ${relation(name)}) THEN RAISE EXCEPTION 'local_business_schema_vendor_not_empty'; END IF; END $local_empty_vendor$;`);
  statements.push(`DROP TABLE ${relation(name)} RESTRICT;`);
 }
 for(const x of c.changes.filter(x=>x.classification==='vendor-function-remove'))statements.push(`DROP ${routineTarget(installed.get(`function:${x.name}`))} RESTRICT;`);
 for(const x of c.changes.filter(x=>x.classification==='vendor-index-remove'&&!finiteOldTables.some(t=>x.name.startsWith(t.split('.')[0]+'.')&&x.name.split('.')[1].includes(t.split('.')[1])))){
  // All obsolete Iceberg indexes disappear with their exact empty tables.
  if(x.name!=='storage.bucketid_objname'&&x.name.startsWith('storage.idx_iceberg_'))continue;
  if(x.name!=='storage.bucketid_objname')fail();statements.push(`DROP INDEX ${relation(x.name)} RESTRICT;`);
 }
 for(const name of finiteNewTables){
  const columns=source.definitions.filter(x=>x.kind==='column'&&x.name.startsWith(name+'.')).sort((a,b)=>tuple(a)[0]-tuple(b)[0]);
  if(!columns.length||columns.some((d,i)=>tuple(d)[0]!==i+1))fail();statements.push(`CREATE TABLE ${relation(name)} (${columns.map(columnSql).join(',')});`);
 }
 const added=c.changes.filter(x=>x.classification==='vendor-column-create'&&!finiteNewTables.some(n=>x.name.startsWith(n+'.'))).sort((a,b)=>a.name.split('.').slice(0,2).join('.').localeCompare(b.name.split('.').slice(0,2).join('.'))||tuple(lookup('column',a.name))[0]-tuple(lookup('column',b.name))[0]);
 if(!same(added.map(x=>x.name).sort(),[...finiteAddedColumns].sort()))fail();
 for(const x of added){const d=lookup('column',x.name),name=x.name.split('.').slice(0,2).join('.');statements.push(`ALTER TABLE ${relation(name)} ADD COLUMN ${columnSql(d)};`)}
 statements.push('CREATE TEMP TABLE local_schema_saved_ledger ON COMMIT DROP AS SELECT version,name,statements FROM supabase_migrations.schema_migrations;');
 statements.push("DO $local_ledger_count$ BEGIN IF (SELECT count(*) FROM local_schema_saved_ledger)<>259 THEN RAISE EXCEPTION 'local_business_schema_ledger_count_changed'; END IF; END $local_ledger_count$;");
 statements.push('DROP TABLE supabase_migrations.schema_migrations RESTRICT;');
 const ledgerColumns=source.definitions.filter(x=>x.kind==='column'&&x.name.startsWith('supabase_migrations.schema_migrations.')).sort((a,b)=>tuple(a)[0]-tuple(b)[0]);
 if(ledgerColumns.length!==6||ledgerColumns.some((x,i)=>tuple(x)[0]!==i+1))fail();
 statements.push(`CREATE TABLE supabase_migrations.schema_migrations (${ledgerColumns.map(columnSql).join(',')});`);
 for(const x of source.definitions.filter(x=>x.kind==='constraint'&&x.name.startsWith('supabase_migrations.schema_migrations.'))){
  if(!x.definition.endsWith(':true'))fail();statements.push(`ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT ${identifier(x.name.split('.')[2])} ${x.definition.slice(0,-5)};`);
 }
 statements.push('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) SELECT version,name,statements FROM local_schema_saved_ledger;');
 statements.push("DO $local_ledger_preserved$ BEGIN IF EXISTS((SELECT version,name,statements FROM local_schema_saved_ledger EXCEPT SELECT version,name,statements FROM supabase_migrations.schema_migrations) UNION ALL (SELECT version,name,statements FROM supabase_migrations.schema_migrations EXCEPT SELECT version,name,statements FROM local_schema_saved_ledger)) THEN RAISE EXCEPTION 'local_business_schema_ledger_changed'; END IF; END $local_ledger_preserved$;");
 for(const x of c.changes.filter(x=>['application-function-line-endings','vendor-function-create','vendor-function-definition'].includes(x.classification))){
  const d=lookup('function',x.name),body=tuple(d)[0];permissionObject(d);statements.push(sourceCommand(body));
 }
 const constraints=c.changes.filter(x=>x.classification==='vendor-constraint-create').map(x=>lookup('constraint',x.name));
 for(const x of constraints.sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY'))||a.name.localeCompare(b.name))){
  if(!x.definition.endsWith(':true'))fail();const parts=x.name.split('.');if(parts.length!==3)fail();
  statements.push(`ALTER TABLE ${relation(parts.slice(0,2).join('.'))} ADD CONSTRAINT ${identifier(parts[2])} ${x.definition.slice(0,-5)};`);
 }
 for(const x of c.changes.filter(x=>x.classification==='vendor-index-create')){
  const name=x.name.split('.')[1];if(constraints.some(k=>k.name.split('.')[2]===name&&/^(PRIMARY KEY|UNIQUE)/.test(k.definition)))continue;
  const d=lookup('index',x.name);if(!/^CREATE (UNIQUE )?INDEX /.test(d.definition))fail();statements.push(sourceCommand(d.definition));
 }
 for(const x of c.changes.filter(x=>x.classification==='vendor-trigger-create')){
  const d=lookup('trigger',x.name);if(!d.definition.endsWith(':O')||!d.definition.startsWith('CREATE TRIGGER '))fail();statements.push(sourceCommand(d.definition.slice(0,-2)));
 }
 const defaultChanges=c.changes.filter(x=>x.classification==='default-permissions');
 for(const d of defaultChanges){
  const [schema,owner,kind]=d.name.split('.');if(schema!=='public'||!['postgres','supabase_admin'].includes(owner)||!['S','f','r'].includes(kind))fail();
  const before=installed.get(`default_acl:${d.name}`),after=expected.get(`default_acl:${d.name}`),oldAcl=acl(before.definition,owner),newAcl=after?acl(after.definition,owner):[];
  const type={S:'SEQUENCES',f:'FUNCTIONS',r:'TABLES'}[kind],prefix=`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(owner)} IN SCHEMA public`;
  statements.push(`SET LOCAL ROLE ${identifier(owner)};`);
  for(const who of [...new Set([...oldAcl,...newAcl].map(x=>x.grantee))])statements.push(`${prefix} REVOKE ALL PRIVILEGES ON ${type} FROM ${who?identifier(who):'PUBLIC'};`);
  for(const a of newAcl)for(const g of a.grants)statements.push(`${prefix} GRANT ${g.name} ON ${type} TO ${a.grantee?identifier(a.grantee):'PUBLIC'}${g.option?' WITH GRANT OPTION':''};`);
  statements.push('RESET ROLE;');
 }
 return{format:'nestory-local-finite-schema-correction-v1',enumSql,structuralSql:`BEGIN;SET LOCAL search_path=pg_catalog,public;SET LOCAL statement_timeout='120s';\n${emptyRuntimeGuard}\n${statements.join('\n')}\nCOMMIT;`,
  counts,sourceObjects:8229,sourceDefinitionBytesPreserved:true,permissionsRequireFreshCatalog:true,exactCatalogRequired:true,correctionExecuted:false};
}

const identifier=v=>{if(typeof v!=='string'||!/^[a-z_][a-z0-9_]*$/.test(v))fail();return `"${v}"`};
const relation=v=>{const p=v.split('.');if(p.length!==2)fail();return p.map(identifier).join('.')};
const privileges={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',U:'USAGE',C:'CREATE',X:'EXECUTE'};
function acl(text,owner){
 let rows;try{rows=JSON.parse(text)}catch{fail()};if(!Array.isArray(rows)||new Set(rows).size!==rows.length)fail();
 return rows.map(item=>{
  if(typeof item!=='string')fail();const match=/^([a-z_][a-z0-9_]*|)=([arwdDxtmUCX*]*)\/([a-z_][a-z0-9_]*)$/.exec(item);
  if(!match||match[3]!==owner)fail();const grants=[];let i=0;
  while(i<match[2].length){const code=match[2][i++];if(!privileges[code]||grants.some(g=>g.code===code))fail();const option=match[2][i]==='*';if(option)i++;grants.push({code,name:privileges[code],option})}
  return{grantee:match[1],grants};
 });
}
function permissionObject(d){
 const t=tuple(d);
 if(d.kind==='schema'){
  if(t.length!==2)fail();return{object:`SCHEMA ${identifier(d.name)}`,alter:`SCHEMA ${identifier(d.name)}`,owner:t[0],acl:t[1],allowed:'UC'};
 }
 if(d.kind==='relation'){
  if(t.length!==7||!['r','p','v','m','S'].includes(t[0]))fail();const name=relation(d.name),kind=t[0]==='S'?'SEQUENCE':'TABLE';
  return{object:`${kind} ${name}`,alter:`${t[0]==='m'?'MATERIALIZED VIEW':t[0]==='v'?'VIEW':kind} ${name}`,owner:t[4],acl:t[5],allowed:t[0]==='S'?'rwU':'arwdDxtm'};
 }
 if(d.kind==='function'){
  if(t.length!==3||typeof t[0]!=='string'||!/^CREATE OR REPLACE (FUNCTION|PROCEDURE) /.test(t[0]))fail();
  // pg_get_function_identity_arguments omits type modifiers. Reject any inner
  // parenthesis: it could terminate this routine and introduce another target.
  const m=/^([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\(([a-zA-Z0-9_ .,\[\]"]*)\)$/.exec(d.name);if(!m)fail();
  const kind=t[0].startsWith('CREATE OR REPLACE PROCEDURE ')?'PROCEDURE':'FUNCTION',target=`${kind} ${relation(m[1])}(${m[2]})`;
  return{object:target,alter:target,owner:t[2],acl:t[1],allowed:'X'};
 }
 fail();
}
// Pure, partial correction proposal. Caller must independently authenticate
// the encrypted source package and verify the owned RAM container. Remaining
// structural differences are returned explicitly and cannot authorize import.
export function buildBusinessSchemaPermissionCorrection({source,actual}){
 const classification=classifyBusinessSchemaCorrection({source,actual});
 if(classification.unreviewedApplicationChanges)throw Error('local_business_schema_application_change_unreviewed');
 const expected=checkedDefinitions(source),installed=checkedDefinitions(actual),statements=[],changed=[];
 for(const c of classification.changes){
  if(!['function-permissions','relation-permissions','schema-permissions'].includes(c.classification))continue;
  const key=`${c.kind}:${c.name}`,before=permissionObject(installed.get(key)),after=permissionObject(expected.get(key));
  identifier(before.owner);identifier(after.owner);const oldAcl=acl(before.acl,before.owner),newAcl=acl(after.acl,after.owner);
  for(const a of [...oldAcl,...newAcl])for(const g of a.grants)if(!(oldAcl.includes(a)?before.allowed:after.allowed).includes(g.code))fail();
  statements.push(`SET LOCAL ROLE ${identifier(before.owner)};`);
  for(const who of [...new Set([...oldAcl,...newAcl].map(a=>a.grantee))].sort())statements.push(`REVOKE ALL PRIVILEGES ON ${before.object} FROM ${who?identifier(who):'PUBLIC'};`);
  statements.push('RESET ROLE;');
  if(before.owner!==after.owner)statements.push(`ALTER ${after.alter} OWNER TO ${identifier(after.owner)};`);
  statements.push(`SET LOCAL ROLE ${identifier(after.owner)};`);
  for(const a of newAcl)for(const g of a.grants)statements.push(`GRANT ${g.name} ON ${after.object} TO ${a.grantee?identifier(a.grantee):'PUBLIC'}${g.option?' WITH GRANT OPTION':''};`);
  statements.push('RESET ROLE;');changed.push(c);
 }
 const sql=`BEGIN; SET LOCAL search_path=pg_catalog,public; SET LOCAL statement_timeout='120s';
DO $local_schema_permissions$ BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'postgres' OR inet_server_addr() IS NOT NULL OR current_setting('data_directory')<>'/db/pg' OR current_setting('listen_addresses')<>''
 OR EXISTS(SELECT 1 FROM public.organizations) OR EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.objects) THEN
 RAISE EXCEPTION 'local_business_schema_empty_owned_runtime_required'; END IF;
END $local_schema_permissions$;
${statements.join('\n')}
COMMIT;`;
 return{format:'nestory-local-schema-permission-correction-proposal-v1',sql,changed,
  remaining:classification.changes.filter(c=>!changed.includes(c)),correctionExecuted:false,exactCatalogRequired:true};
}
