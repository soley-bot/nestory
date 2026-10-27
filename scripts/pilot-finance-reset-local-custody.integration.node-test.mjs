import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertSyntheticDescriptor} from './pilot-finance-reset-local-custody.integration.mjs';
const descriptor={runId:'11111111-1111-4111-8111-111111111111',database:'postgres',dbContainer:'1'.repeat(64),
 httpContainer:'2'.repeat(64),authContainer:'3'.repeat(64),restContainer:'4'.repeat(64),networkId:'5'.repeat(64),authUrl:'http://auth:9999',restUrl:'http://rest:3000'};
test('synthetic descriptor requires real postgres database identity for unmodified worker SQL',()=>{
 assert.doesNotThrow(()=>assertSyntheticDescriptor(descriptor));
 assert.throws(()=>assertSyntheticDescriptor({...descriptor,database:'different_database'}));
});
test('synthetic descriptor cannot substitute a hosted endpoint or repeated service ID',()=>{
 assert.throws(()=>assertSyntheticDescriptor({...descriptor,authUrl:'https://pfvmztxktkwyewvxfgot.supabase.co/auth/v1'}));
 assert.throws(()=>assertSyntheticDescriptor({...descriptor,restContainer:descriptor.dbContainer}));
});
test('owned fixture has exactly one committed setup and a correctly terminated disposable marker guard',async()=>{
 const sql=await readFile(new URL('./fixtures/pilot-finance-reset-local-custody-http-setup.sql',import.meta.url),'utf8');
 assert.equal(sql.split('\n').filter(line=>line.trim()==='COMMIT;').length,1);
 assert.match(sql,/current_setting\('nestory\.synthetic_local_custody_run',true\).*\$' AS receipt_disposable_database/);
 assert.equal(sql.split('CREATE TEMP TABLE http_empty_books_fixture').length,2);
});

test('HTTP integration uses one genuine maker and all five marked reset stages without recovery',async()=>{
 const [sql,driver]=await Promise.all(['fixtures/pilot-finance-reset-local-custody-http-setup.sql','pilot-finance-reset-local-custody.integration.mjs'].map(f=>readFile(new URL('./'+f,import.meta.url),'utf8')));
 assert.ok(!sql.includes('http_reviewer'));assert.ok(!driver.includes("signIn('reviewer')"));
 assert.ok(sql.includes("'approval_policy','pilot-october-single-admin-v1'"));assert.ok(sql.includes("'reviewer_actor_id',NULL"));
 assert.ok(sql.includes('financial_reset_empty_zero_scope_on_date'));
 assert.ok(driver.includes("['freeze','checkpoint','prepare','seal','execute']"));
 assert.ok(driver.indexOf('const deniedAuthorization')<driver.indexOf("await rpc('approve_financial_reset_zero_plan'"));
 assert.ok(!driver.includes("perform('prepare-recovery'"));assert.ok(!driver.includes("perform('execute-recovery'"));
 assert.ok(driver.includes('syntheticInverseCommitted:false'));
});
