import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {classifyBusinessSchemaCorrection,buildBusinessSchemaPermissionCorrection,buildBusinessSchemaStructuralCorrection} from './local-backup-business-schema-restore.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const row=(kind,name,v)=>{const definition=typeof v==='string'?v:JSON.stringify(v);return{kind,name,definition,sha256:hash(definition)}};
const packet=definitions=>({definitions,catalog:definitions.map(({kind,name,sha256})=>({kind,name,sha256}))});
test('classifies exact function and relation ACL changes separately from application definition changes',()=>{
 const a=row('function','public.test()',['CREATE FUNCTION test() RETURNS int LANGUAGE sql AS $$SELECT 1$$;','[]','postgres']);
 const e=row('function','public.test()',[JSON.parse(a.definition)[0],'["=X/postgres"]','postgres']);
 let p=classifyBusinessSchemaCorrection({source:packet([e]),actual:packet([a])});assert.equal(p.changes[0].classification,'function-permissions');assert.equal(p.unreviewedApplicationChanges,0);
 const changed=row('function','public.test()',['CREATE FUNCTION test() RETURNS int LANGUAGE sql AS $$SELECT 2$$;','[]','postgres']);
 p=classifyBusinessSchemaCorrection({source:packet([changed]),actual:packet([a])});assert.equal(p.unreviewedApplicationChanges,1);
 const old=row('relation','public.leases',['r',true,false,'d','postgres','[]',null]),next=row('relation','public.leases',['r',true,false,'d','postgres','["anon=r/postgres"]',null]);
 assert.equal(classifyBusinessSchemaCorrection({source:packet([next]),actual:packet([old])}).changes[0].classification,'relation-permissions');
});
test('vendor additions and removals and ledger physical changes remain explicit',()=>{
 const source=packet([row('column','storage.objects.archived_at',[1,'timestamp',false,'','',null]),row('column','supabase_migrations.schema_migrations.rollback',[6,'text',false,'','',null])]);
 const actual=packet([row('relation','storage.iceberg_tables',['r',true,false,'d','postgres','[]',null])]);
 const p=classifyBusinessSchemaCorrection({source,actual});assert.deepEqual(p.changes.map(x=>x.classification).sort(),['migration-ledger-structure','vendor-column-create','vendor-relation-remove']);assert.equal(p.correctionExecuted,false);
});
test('global namespace is allowed only for the catalog global default-ACL kind',()=>{
 const p=classifyBusinessSchemaCorrection({source:packet([row('default_acl','global.postgres.f','["=X/postgres"]')]),actual:packet([])});
 assert.equal(p.changes[0].classification,'default-permissions');
 assert.throws(()=>classifyBusinessSchemaCorrection({source:packet([row('schema','global',['postgres','[]'])]),actual:packet([])}),/definition_invalid/);
});
test('unknown schemas, altered definition hashes, missing and duplicate catalog entries are rejected',()=>{
 const valid=packet([row('schema','public',['postgres','[]'])]);
 for(const mutate of [p=>p.definitions[0].definition+='x',p=>p.catalog=[],p=>p.catalog[0].name='other',p=>{p.definitions.push(p.definitions[0]);p.catalog.push(p.catalog[0])}]){
  const s=structuredClone(valid);mutate(s);assert.throws(()=>classifyBusinessSchemaCorrection({source:s,actual:valid}),/definition_invalid/);
 }
 assert.throws(()=>classifyBusinessSchemaCorrection({source:packet([row('schema','unexpected',['postgres','[]'])]),actual:packet([])}),/definition_invalid/);
});
test('permission correction removes extra grants and reconstructs exact owner grants without executing function bodies',()=>{
 const body='CREATE OR REPLACE FUNCTION public.test() RETURNS int LANGUAGE sql AS $$SELECT 1$$;';
 const source=packet([row('function','public.test()',[body,'["=X/postgres","postgres=X/postgres"]','postgres']),row('column','storage.objects.archived_at',[20,'timestamp',false,'','',null])]);
 const actual=packet([row('function','public.test()',[body,'["=X/postgres","postgres=X/postgres","anon=X/postgres"]','postgres'])]);
 const p=buildBusinessSchemaPermissionCorrection({source,actual});
 assert.match(p.sql,/REVOKE ALL PRIVILEGES ON FUNCTION "public"\."test"\(\) FROM "anon"/);
 assert.match(p.sql,/GRANT EXECUTE ON FUNCTION "public"\."test"\(\) TO PUBLIC/);
 assert.match(p.sql,/EXISTS\(SELECT 1 FROM public.organizations\)/);assert.doesNotMatch(p.sql,/CREATE OR REPLACE FUNCTION|CASCADE/);
 assert.equal(p.remaining.length,1);assert.equal(p.correctionExecuted,false);assert.equal(p.exactCatalogRequired,true);
});
test('permission proposal rejects changed application bodies, unknown grantors and identifier injection',()=>{
 const original=packet([row('function','public.test()',['CREATE OR REPLACE FUNCTION public.test() RETURNS int LANGUAGE sql AS $$SELECT 1$$;','["postgres=X/postgres"]','postgres'])]);
 const semantic=packet([row('function','public.test()',['CREATE OR REPLACE FUNCTION public.test() RETURNS int LANGUAGE sql AS $$SELECT 2$$;','["postgres=X/postgres"]','postgres'])]);
 assert.throws(()=>buildBusinessSchemaPermissionCorrection({source:semantic,actual:original}),/application_change_unreviewed/);
 for(const entry of [row('function','public.test()',[JSON.parse(original.definitions[0].definition)[0],'["anon=X/another"]','postgres']),row('function','public.test();DROP()',[JSON.parse(original.definitions[0].definition)[0],'[]','postgres'])]){
  const a=entry.name===original.definitions[0].name?original:packet([{...entry,definition:JSON.stringify([JSON.parse(entry.definition)[0],'["postgres=X/postgres"]','postgres']),sha256:hash(JSON.stringify([JSON.parse(entry.definition)[0],'["postgres=X/postgres"]','postgres']))}]);
  assert.throws(()=>buildBusinessSchemaPermissionCorrection({source:packet([entry]),actual:a}),/definition_invalid/);
 }
});
test('routine identity cannot add an unclassified second permission target',()=>{
 const body='CREATE OR REPLACE FUNCTION public.test(integer) RETURNS int LANGUAGE sql AS $$SELECT 1$$;',name='public.test(integer), public.other(integer)';
 const actual=packet([row('function',name,[body,'["postgres=X/postgres"]','postgres'])]),source=packet([row('function',name,[body,'["=X/postgres","postgres=X/postgres"]','postgres'])]);
 assert.throws(()=>buildBusinessSchemaPermissionCorrection({source,actual}),/definition_invalid/);
});
test('only exact CRLF-to-LF application definition differences have the reviewed restoration classification',()=>{
 const body='CREATE OR REPLACE FUNCTION public.test()\nRETURNS int LANGUAGE sql AS $$\nSELECT 1\n$$;';
 const actual=packet([row('function','public.test()',[body,'[]','postgres'])]);
 const source=packet([row('function','public.test()',[body.replaceAll('\n','\r\n'),'[]','postgres'])]);
 assert.equal(classifyBusinessSchemaCorrection({source,actual}).changes[0].classification,'application-function-line-endings');
 for(const changed of [body.replaceAll('\n','\r'),body.replace('SELECT 1',' SELECT 1'),body.replace('SELECT','select')])
  assert.equal(classifyBusinessSchemaCorrection({source:packet([row('function','public.test()',[changed,'[]','postgres'])]),actual}).unreviewedApplicationChanges,1);
 assert.throws(()=>buildBusinessSchemaStructuralCorrection({source,actual}),/finite_roster_changed/);
});
