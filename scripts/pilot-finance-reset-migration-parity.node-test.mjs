import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {verifyResetMigrationLedgerDescriptors} from './pilot-finance-reset-migration-parity.mjs';
import {describeMigrationStatement} from './hosted-migration-parity-core.mjs';
import {assertHostedObservation} from './pilot-finance-reset-hosted-transport.mjs';
import {digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
const manifestPath='supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json';
const manifest=await readFile(new URL('../'+manifestPath,import.meta.url));
const baselineName='20260808235616_operational_schema_baseline.sql',baselineSql=await readFile(new URL('../supabase/migrations/'+baselineName,import.meta.url),'utf8');
const baseline={version:'20260808235616',name:'operational_schema_baseline',statements:[{byteLength:1238466,sha256:'4c449a7a22c37bf7867a008e6b5b42dbf20b91667fe0630cb4bec79f9aa83f3d'}]};
test('shared verifier preserves exact reviewed historical raw descriptor without claiming SQL byte identity',()=>{
 const r=verifyResetMigrationLedgerDescriptors([baseline],[{name:baselineName,sql:baselineSql}],manifest);
 assert.deepEqual(r.contract.reconciledVersions,['20260808235616']);assert.deepEqual(r.contract.descriptorBridgeVersions,['20260808235616']);
 assert.notDeepEqual(r.installedLedger[0],baseline);assert.equal(baseline.statements[0].byteLength,1238466);
});
test('hosted observation uses same finite verifier while preserving raw packet ledger binding',()=>{
 const ledger=[structuredClone(baseline)],packet={schemaSha256:digestJson([]),ledgerSha256:digestJson(ledger),operation:{timezone:'UTC'}},
  observation={catalog:[],ledger,timezone:'UTC',capabilityCount:0,sourceSha256:'a'.repeat(64),foreignSha256:'b'.repeat(64)},
  files=new Map([['supabase/migrations/'+baselineName,baselineSql],[manifestPath,manifest.toString('utf8')]]);
 assert.doesNotThrow(()=>assertHostedObservation(packet,observation,files));
 const changed=structuredClone(observation);changed.ledger[0].statements[0].byteLength++;
 assert.throws(()=>assertHostedObservation(packet,changed,files),/installed_schema_or_ledger_changed/);
 packet.ledgerSha256=digestJson(changed.ledger);assert.throws(()=>assertHostedObservation(packet,changed,files),/installed_migration_content_changed/);
 files.delete(manifestPath);assert.throws(()=>assertHostedObservation({...packet,ledgerSha256:digestJson(ledger)},observation,files),/installed_migration_content_changed/);
});
test('only exact full Git bytes or one exact appended LF use the byte-equivalent bridge',()=>{
 const sql='\nSELECT 1;\n',source={name:'20261027000000_fixture.sql',sql},entry={version:'20261027000000',name:'fixture',statements:[describeMigrationStatement(sql+'\n')]};
 const r=verifyResetMigrationLedgerDescriptors([entry],[source],manifest);assert.deepEqual(r.contract.reconciledVersions,[]);
 for(const text of [sql+'\n\n','SELECT 2;\n']){
  const changed={...entry,statements:[describeMigrationStatement(text)]};assert.throws(()=>verifyResetMigrationLedgerDescriptors([changed],[source],manifest));
 }
});
test('changed legacy source, altered manifest, name or unexpected historical hash cannot create a new exception',()=>{
 for(const run of[
  ()=>verifyResetMigrationLedgerDescriptors([baseline],[{name:baselineName,sql:baselineSql+'\nSELECT 2;'}],manifest),
  ()=>verifyResetMigrationLedgerDescriptors([baseline],[{name:baselineName,sql:baselineSql}],Buffer.concat([manifest,Buffer.from(' ')])),
  ()=>verifyResetMigrationLedgerDescriptors([{...baseline,name:'different'}],[{name:baselineName,sql:baselineSql}],manifest),
  ()=>verifyResetMigrationLedgerDescriptors([{...baseline,statements:[{byteLength:1238466,sha256:'a'.repeat(64)}]}],[{name:baselineName,sql:baselineSql}],manifest),
 ])assert.throws(run);
});
