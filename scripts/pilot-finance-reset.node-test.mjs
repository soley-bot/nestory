import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TARGET, VALIDATION_SOURCE_ARTIFACTS, json, sha256, normalizedSource, assertLocalContainer, assertLocalSource, assertValidationSourceEvidence, buildManifest, catalogSql, rowInventorySql, logicalInboundDescriptors } from './pilot-finance-reset-core.mjs';
const hash = 'a'.repeat(64), id = '11111111-1111-4111-8111-111111111111';
const binding = { ...TARGET, baseSha:TARGET.baseSha, fixtureSha256:TARGET.fixtureSha256, migrationsSha256:hash, containerId:hash, authUsers:[] };
const table = (name='public.example') => ({table:name, columns:['id','organization_id'], pk:['id'], jsonColumns:[], unconstrainedUuidColumns:[],foreignKeys:[]});
const rule = {scope:'organization_id',disposition:'archive-remove',opaqueColumns:[]};
const row = (name='public.example',pk=id) => ({table:name,scope:TARGET.organization,pk:[pk],sha256:hash,references:{}});
const input = () => ({operationId:id,binding,tables:[table()],rows:[row()],schema:[],storageObjects:[],registry:{'public.example':rule}});
const issue = (m,code) => m.issues.some(i=>i.code===code);
const source = () => ({config:`project_id = "${TARGET.project}"\n[api]\nport = 61321\n[db]\nport = 61322\n[other]\nport = 1\n`,inspect:{name:`/${TARGET.container}`,project:TARGET.project,id:hash,image:`sha256:${hash}`,running:true},baseSha:TARGET.baseSha,fixtureSha256:TARGET.fixtureSha256,identities:{cronLaunch:'off',organizations:[{id:TARGET.organization,slug:TARGET.slug}],authUsers:[101,501,601,701,801].map(n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`)}});
const evidenceRoots = { workspaceRoot: path.resolve('synthetic-workspace'), projectRoot: path.resolve('synthetic-project') };
const validationEvidence = () => VALIDATION_SOURCE_ARTIFACTS.map(artifact => ({
  path: path.join(artifact.root === 'project' ? evidenceRoots.projectRoot : evidenceRoots.workspaceRoot, artifact.directory, artifact.name),
  sha256: hash,
}));

test('validation binding requires every candidate migration and fixture/runner artifact', () => {
  const evidence = validationEvidence();
  const validated = assertValidationSourceEvidence(evidence, evidenceRoots);
  assert.equal(validated.length, 30);
  assert.equal(validated.filter(item => item.name.endsWith('.sql')).length, 24);
  assert.ok(validated.some(item => item.name === 'financial-report-revision-concurrency.node-test.mjs'));
  assert.deepEqual(assertValidationSourceEvidence([...evidence].reverse(), evidenceRoots), validated);
});

test('validation evidence rejects every missing artifact and same-count substitutions', () => {
  for (let index = 0; index < VALIDATION_SOURCE_ARTIFACTS.length; index++) {
    const missing = validationEvidence(); missing.splice(index, 1);
    assert.throws(() => assertValidationSourceEvidence(missing, evidenceRoots), /incomplete/);
    const duplicate = validationEvidence(); duplicate[index] = duplicate[(index + 1) % duplicate.length];
    assert.throws(() => assertValidationSourceEvidence(duplicate, evidenceRoots), /duplicate/);
  }
  const unknownMigration = validationEvidence();
  unknownMigration[0].path = path.join(evidenceRoots.projectRoot, 'supabase/migrations/20261023093000_unreviewed.sql');
  assert.throws(() => assertValidationSourceEvidence(unknownMigration, evidenceRoots), /Unexpected/);
});

test('validation evidence rejects changed roots, relative paths and malformed hashes', () => {
  for (const mutate of [
    evidence => { evidence[0].path = path.join(evidenceRoots.workspaceRoot, 'supabase/migrations', path.basename(evidence[0].path)); },
    evidence => { const item = evidence.at(-1); item.path = path.join(evidenceRoots.projectRoot, 'scripts', path.basename(item.path)); },
    evidence => { evidence[0].path = path.relative(process.cwd(), evidence[0].path); },
    evidence => { evidence[0].sha256 = 'not-a-digest'; },
    evidence => { evidence[0] = null; },
  ]) {
    const evidence = validationEvidence(); mutate(evidence);
    assert.throws(() => assertValidationSourceEvidence(evidence, evidenceRoots), /artifact/);
  }
  assert.throws(() => assertValidationSourceEvidence(null, evidenceRoots), /missing/);
});
test('canonical hashes sort object keys but preserve array order',()=>{assert.equal(json({b:1,a:2}),json({a:2,b:1}));assert.notEqual(sha256(json([1,2])),sha256(json([2,1])));assert.equal(normalizedSource('\uFEFFa\r\nb'),'a\nb');});
test('fixed project and container accepted before querying identities',()=>assert.doesNotThrow(()=>assertLocalContainer(source())));
test('wrong TOML sections, container, base and fixture fail closed',()=>{for(const mutate of [s=>s.config=s.config.replace('[api]','[wrong]'),s=>s.config=s.config.replace('[db]','[wrong]'),s=>s.inspect.project='other',s=>s.inspect.running=false,s=>s.baseSha='0'.repeat(40),s=>s.fixtureSha256=hash]) {const s=source();mutate(s);assert.throws(()=>assertLocalContainer(s));}});
test('synthetic identity and contained scheduled writers mandatory',()=>{assert.doesNotThrow(()=>assertLocalSource(source()));for(const mutate of [s=>s.identities.cronLaunch='on',s=>s.identities.authUsers.push(id),s=>s.identities.organizations.push({id,slug:'customer'})]){const s=source();mutate(s);assert.throws(()=>assertLocalSource(s));}});
test('accepted manifest remains nonexecuting and self-hashed',()=>{const m=buildManifest(input());assert.equal(m.inventoryAccepted,true);assert.equal(m.executionSupported,false);const {manifestSha256,...body}=m;assert.equal(manifestSha256,sha256(json(body)));});
test('catalog drift rejected even when unknown table empty',()=>{const i=input();i.tables.push(table('public.future'));assert.ok(issue(buildManifest(i),'unclassified_table'));});
test('missing table, key, opaque JSON and unconstrained UUID fail closed',()=>{for(const [mutate,code] of [[i=>i.tables=[],'required_table_missing'],[i=>i.tables[0].pk=[],'missing_primary_key'],[i=>i.tables[0].jsonColumns=['payload'],'unreviewed_json_columns'],[i=>i.tables[0].unconstrainedUuidColumns=['hidden_id'],'unreviewed_uuid_reference']]){const i=input();i.rows=[];mutate(i);assert.ok(issue(buildManifest(i),code));}});
test('foreign rows, duplicate PK and invalid hash abort',()=>{for(const mutate of [i=>i.rows[0].scope=id,i=>i.rows.push(row()),i=>i.rows[0].sha256='invalid']){const i=input();mutate(i);assert.throws(()=>buildManifest(i));}});
test('missing reference capture cannot be silently treated as nullable',()=>{const i=input();i.tables[0].foreignKeys=[{name:'parent',columns:['parent_id'],target:'public.example',targetColumns:['id']}];assert.throws(()=>buildManifest(i),/Missing captured/);});
test('unresolved FK and cross-scope inbound rows prevent acceptance',()=>{const i=input();i.tables[0].foreignKeys=[{name:'parent',columns:['parent_id'],target:'public.example',targetColumns:['id']}];i.rows[0].references.parent_id='other';assert.ok(issue(buildManifest(i),'unresolved_or_cross_scope_fk'));const j=input();j.inbound=[{table:'public.foreign',target:'public.example',constraint:'parent',rows:1}];assert.ok(issue(buildManifest(j),'cross_scope_inbound_dependency'));});
test('storage path resolves only in its reviewed bucket',()=>{const i=input();i.tables=[{...table('public.documents'),columns:['id','organization_id','storage_path']}];i.registry={'public.documents':rule};i.rows=[{...row('public.documents'),references:{storage_path:'same/path'}}];i.storageObjects=[{id,bucket:'wrong',name:'same/path'}];assert.ok(issue(buildManifest(i),'storage_metadata_missing_or_ambiguous'));i.storageObjects[0].bucket='nestory-documents';assert.equal(buildManifest(i).inventoryAccepted,true);});
test('unknown polymorphic source kind rejected',()=>{const i=input();i.tables=[{...table('public.ledger_entries'),columns:['id','organization_id','source_id','source_type']}];i.registry={'public.ledger_entries':rule};i.rows=[{...row('public.ledger_entries'),references:{source_id:id,source_type:'unknown'}}];assert.ok(issue(buildManifest(i),'unreviewed_polymorphic_kind'));});
test('inventory deterministic when row order changes',()=>{const i=input();i.rows.push(row('public.example','22222222-2222-4222-8222-222222222222'));const a=buildManifest(i);i.rows.reverse();assert.equal(a.manifestSha256,buildManifest(i).manifestSha256);});
test('SQL inventory is read only, orders FK descriptors and scans inbound dependencies',()=>{assert.match(catalogSql,/ORDER BY f.conname/);const t={...table('public.tenant_invoices'),columns:['id','organization_id','unit_id'],foreignKeys:[{name:'self',columns:['unit_id'],target:'public.tenant_invoices',targetColumns:['id']}]};const sql=rowInventorySql([t]);assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/'inbound'/);assert.match(sql,/IS DISTINCT FROM/);assert.doesNotMatch(sql,/\b(DELETE|UPDATE|INSERT|TRUNCATE|COPY|session_replication_role)\b/i);});

test('ambiguous polymorphic identities never choose the first table',()=>{
  const i=input();const names=['public.owner_event_allocation_sets','public.owner_payments','public.owner_invoices'];
  i.tables=names.map(name=>({...table(name),columns:name===names[0]?['id','organization_id','source_type','source_id','source_line_id']:['id','organization_id']}));
  i.registry=Object.fromEntries(names.map(name=>[name,rule]));
  i.rows=[{...row(names[0]),references:{source_type:'owner_invoice_payment',source_id:id,source_line_id:null}},row(names[1]),row(names[2])];
  assert.ok(issue(buildManifest(i),'unresolved_polymorphic_reference'));
});
test('legacy ledger payment/withdrawal target needs reverse linkage',()=>{
  const i=input();i.tables=[{...table('public.ledger_entries'),columns:['id','organization_id','source_type','source_id']},{...table('public.property_withdrawals'),columns:['id','organization_id','ledger_entry_id']}];
  i.registry=Object.fromEntries(i.tables.map(t=>[t.table,rule]));
  i.rows=[{...row('public.ledger_entries'),references:{source_type:'owner_cash_event',source_id:id}},{...row('public.property_withdrawals'),references:{ledger_entry_id:'other'}}];
  i.logicalInbound=logicalInboundDescriptors(i.tables,i.registry).map(descriptor=>({...descriptor,rows:0}));
  assert.ok(issue(buildManifest(i),'unresolved_polymorphic_reference'));i.rows[1].references.ledger_entry_id=id;assert.equal(buildManifest(i).inventoryAccepted,true);
});
test('rebuilt period IDs are explicitly historical, never claimed resolved',()=>{
  const i=input(), close='public.owner_close_line_sources', periods='public.owner_balance_periods';
  i.tables=[{...table(close),columns:['id','organization_id','source_type','source_id','source_line_id','owner_balance_period_component_id']},{...table(periods),columns:['id','organization_id','closed_revision_id']}];
  i.registry={[close]:rule,[periods]:rule};i.rows=[{...row(close),references:{source_type:'period_component',source_id:id,source_line_id:'old-component',owner_balance_period_component_id:'old-component'}},{...row(periods),references:{closed_revision_id:null}}];
  i.logicalInbound=logicalInboundDescriptors(i.tables,i.registry).map(descriptor=>({...descriptor,rows:0}));
  const m=buildManifest(i);assert.equal(m.inventoryAccepted,true);assert.ok(m.polymorphic.some(r=>r.historicalSnapshot&&!r.resolved));assert.ok(m.staticReferences.some(r=>r.historicalSnapshot&&!r.resolved));assert.equal(m.executionSupported,false);
});
