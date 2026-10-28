import test from 'node:test';
import assert from 'node:assert/strict';
import {hashBytes} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,sortDescriptors} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {describeMigrationStatement} from './hosted-migration-parity-core.mjs';
import {buildExecuteTransitionManifest,assertExecuteTransitionWithManifest,verifyExecuteTransitionObservation} from './local-backup-execute-transition.mjs';
function fixture(){
 const migrationSql='SELECT 1;\n',beforeCatalog=[{kind:'function',name:'app_private.synthetic()',sha256:'a'.repeat(64)},
  {kind:'relation',name:'public.synthetic_preserved',sha256:'b'.repeat(64)}];
 const afterCatalog=[{...beforeCatalog[0],sha256:'c'.repeat(64)},beforeCatalog[1],
  {kind:'relation',name:'app_private.synthetic_resume',sha256:'d'.repeat(64)}];
 const ledger=Array.from({length:260},(_,i)=>({version:String(20260000000000+i),name:'synthetic',statements:[describeMigrationStatement('SELECT 0;')]}));
 ledger[259]={version:'20261027005615',name:'financial_reset_empty_books_preserved_contracts',statements:[describeMigrationStatement('SELECT 0;')]};
 const historicalObservation={catalog:beforeCatalog,ledger};
 const currentObservation={catalog:afterCatalog,ledger:[...ledger,{version:'20261028053520',name:'financial_reset_execute_attempt_foreign_baseline',statements:[describeMigrationStatement(migrationSql)]}]};
 return{migrationSql,historicalObservation,currentObservation,manifest:buildExecuteTransitionManifest({beforeCatalog,afterCatalog,migrationSql}),
  packet:{operation:{operationId:'7c70e27f-ba37-48cc-8f93-d32badcb2fb7',mainSha:'9a08df0181d391a9bc8e6c28319c6678485f4c59'},
   schemaSha256:digestJson(sortDescriptors(beforeCatalog)),ledgerSha256:digestJson(ledger)}};
}
test('finite native delta preserves historical packet and proves complete new catalog/ledger',()=>{
 const f=fixture(),original=structuredClone(f),result=assertExecuteTransitionWithManifest(f);
 assert.equal(result.historicalSchemaSha256,f.packet.schemaSha256);assert.notEqual(result.currentSchemaSha256,f.packet.schemaSha256);
 assert.equal(result.changedDescriptorCount,2);assert.equal(result.currentObjectCount,3);assert.deepEqual(f,original);
});
for(const [label,change]of[
 ['unrelated descriptor drift',f=>f.currentObservation.catalog[1].sha256='f'.repeat(64)],
 ['unlisted extra descriptor',f=>f.currentObservation.catalog.push({kind:'relation',name:'public.unreviewed',sha256:'f'.repeat(64)})],
 ['missing target descriptor',f=>f.currentObservation.catalog.pop()],
 ['duplicate target descriptor',f=>f.currentObservation.catalog.push(f.currentObservation.catalog[0])],
 ['wrong historical replacement hash',f=>f.manifest.changes.find(x=>x.beforeSha256!==null).beforeSha256='f'.repeat(64)],
 ['addition shadows original descriptor',f=>f.manifest.changes.find(x=>x.beforeSha256===null).name='public.synthetic_preserved'],
 ['changed old ledger prefix',f=>f.currentObservation.ledger[0]={...f.currentObservation.ledger[0],name:'changed'}],
 ['extra new migration',f=>f.currentObservation.ledger.push(f.currentObservation.ledger.at(-1))],
 ['wrong migration bytes',f=>f.migrationSql='SELECT 2;\n'],
 ['wrong installed SQL',f=>f.currentObservation.ledger.at(-1).statements=[describeMigrationStatement('SELECT 2;')]],
 ['wrong target identity',f=>f.currentObservation.ledger.at(-1).version='20261028053521'],
 ['wrong packet schema',f=>f.packet.schemaSha256='f'.repeat(64)],
 ['wrong packet ledger',f=>f.packet.ledgerSha256='f'.repeat(64)],
 ['another operation',f=>f.packet.operation.operationId='11111111-1111-4111-8111-111111111111'],
 ['another original release',f=>f.packet.operation.mainSha='a'.repeat(40)],
])test(`transition rejects ${label}`,()=>{const f=structuredClone(fixture());change(f);assert.throws(()=>assertExecuteTransitionWithManifest(f),/transition_unverified/)});
test('generator refuses dropped or duplicate catalog identities and empty changes',()=>{
 const f=fixture(),beforeCatalog=f.historicalObservation.catalog,migrationSql=f.migrationSql;
 for(const afterCatalog of [beforeCatalog.slice(1),[...beforeCatalog,beforeCatalog[0]],beforeCatalog])
  assert.throws(()=>buildExecuteTransitionManifest({beforeCatalog,afterCatalog,migrationSql}),/transition_unverified/);
});
test('migration bytes remain pinned even when caller changes both ledger and digest without reviewed manifest',()=>{
 const f=fixture();f.migrationSql='SELECT 2;\n';f.currentObservation.ledger.at(-1).statements=[describeMigrationStatement(f.migrationSql)];
 assert.notEqual(hashBytes(f.migrationSql),f.manifest.migrationSha256);assert.throws(()=>assertExecuteTransitionWithManifest(f));
});
test('operational fixed-file entry refuses a synthetic packet before reading a manifest',async()=>{
 await assert.rejects(verifyExecuteTransitionObservation(fixture()));
});
