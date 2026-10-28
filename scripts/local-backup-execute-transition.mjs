// Finite, native-measured schema transition for the already sealed Pilot plan.
// The historical packet is never rewritten. This proves schema/ledger parity,
// not actor authority, current business state, or permission to execute.
import {readFile} from 'node:fs/promises';
import {canonicalJson,hashBytes,assertOperatorPacket} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,sortDescriptors} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {selectCapturedMigrations} from './pilot-finance-reset-migration-parity.mjs';

export const EXECUTE_TRANSITION_MIGRATION='supabase/migrations/20261028053520_financial_reset_execute_attempt_foreign_baseline.sql';
export const EXECUTE_TRANSITION_MANIFEST='scripts/local-backup-execute-transition-manifest.json';
const version='20261028053520',name='financial_reset_execute_attempt_foreign_baseline';
const operationId='7c70e27f-ba37-48cc-8f93-d32badcb2fb7',originalMainSha='9a08df0181d391a9bc8e6c28319c6678485f4c59';
const hash=/^[a-f0-9]{64}$/;
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...keys].sort());
const fail=()=>{throw Error('local_execute_transition_unverified')};
const key=d=>canonicalJson([d.kind,d.name]);
function catalogMap(catalog){
 if(!Array.isArray(catalog)||!catalog.length||catalog.length>20000)fail();
 const result=new Map();
 for(const d of catalog){
  if(!exact(d,['kind','name','sha256'])||typeof d.kind!=='string'||!d.kind||d.kind.length>64||
   typeof d.name!=='string'||!d.name||d.name.length>4096||!hash.test(d.sha256)||result.has(key(d)))fail();
  result.set(key(d),d);
 }
 return result;
}
export function assertExecuteTransitionManifest(m){
 if(!exact(m,['format','operationId','originalMainSha','migrationPath','migrationSha256','changes'])||
  m.format!=='nestory-local-execute-schema-transition-v1'||m.operationId!==operationId||m.originalMainSha!==originalMainSha||
  m.migrationPath!==EXECUTE_TRANSITION_MIGRATION||!hash.test(m.migrationSha256)||
  !Array.isArray(m.changes)||m.changes.length<1||m.changes.length>96)fail();
 const seen=new Set();
 for(const c of m.changes){
  if(!exact(c,['kind','name','beforeSha256','afterSha256'])||typeof c.kind!=='string'||!c.kind||c.kind.length>64||
   typeof c.name!=='string'||!c.name||c.name.length>4096||!(c.beforeSha256===null||hash.test(c.beforeSha256))||
   !hash.test(c.afterSha256)||c.beforeSha256===c.afterSha256||seen.has(key(c)))fail();
  seen.add(key(c));
 }
 if(!same(m.changes,sortDescriptors(m.changes)))fail();
 return m;
}

// Review-time generator. Inputs must be canonical catalog reads immediately
// before/after applying the pinned migration in the owned synthetic database.
// Removed descriptors are forbidden. Every unchanged descriptor is compared.
export function buildExecuteTransitionManifest({beforeCatalog,afterCatalog,migrationSql}){
 const before=catalogMap(beforeCatalog),after=catalogMap(afterCatalog),changes=[];
 if(typeof migrationSql!=='string'||!migrationSql.trim())fail();
 for(const identity of before.keys())if(!after.has(identity))fail();
 for(const [identity,d]of after){const previous=before.get(identity);
  if(!previous||previous.sha256!==d.sha256)changes.push({kind:d.kind,name:d.name,beforeSha256:previous?.sha256??null,afterSha256:d.sha256});
 }
 return assertExecuteTransitionManifest({format:'nestory-local-execute-schema-transition-v1',operationId,originalMainSha,
  migrationPath:EXECUTE_TRANSITION_MIGRATION,migrationSha256:hashBytes(migrationSql.replaceAll('\r\n','\n')),changes:sortDescriptors(changes)});
}

// Pure comparison for offline tests/review; the operational entry below reads
// the fixed reviewed manifest and migration itself, never caller exceptions.
export function assertExecuteTransitionWithManifest({packet,historicalObservation,currentObservation,manifest,migrationSql}){
 const m=assertExecuteTransitionManifest(manifest);
 if(packet?.operation?.operationId!==operationId||packet.operation.mainSha!==originalMainSha||
  typeof migrationSql!=='string'||hashBytes(migrationSql.replaceAll('\r\n','\n'))!==m.migrationSha256)fail();
 const historical=catalogMap(historicalObservation?.catalog),current=catalogMap(currentObservation?.catalog);
 if(digestJson(sortDescriptors([...historical.values()]))!==packet.schemaSha256||
  digestJson(historicalObservation.ledger)!==packet.ledgerSha256||!Array.isArray(historicalObservation.ledger)||
  historicalObservation.ledger.length!==260||historicalObservation.ledger.at(-1)?.version!=='20261027005615'||
  !Array.isArray(currentObservation.ledger)||currentObservation.ledger.length!==261||
  !same(currentObservation.ledger.slice(0,-1),historicalObservation.ledger))fail();
 const targetLedger=currentObservation.ledger.at(-1);
 if(targetLedger?.version!==version||targetLedger.name!==name)fail();
 try{selectCapturedMigrations([targetLedger],[{name:EXECUTE_TRANSITION_MIGRATION.split('/').at(-1),sql:migrationSql}]);}catch{fail();}
 const expected=new Map(historical);
 for(const c of m.changes){const identity=key(c),old=expected.get(identity);
  if(c.beforeSha256===null?old!==undefined:old?.sha256!==c.beforeSha256)fail();
  expected.set(identity,{kind:c.kind,name:c.name,sha256:c.afterSha256});
 }
 if(!same(sortDescriptors([...expected.values()]),sortDescriptors([...current.values()])))fail();
 return Object.freeze({format:'nestory-verified-execute-schema-transition-v1',migrationSha256:m.migrationSha256,
  manifestSha256:hashBytes(canonicalJson(m)),historicalSchemaSha256:packet.schemaSha256,historicalLedgerSha256:packet.ledgerSha256,
  currentSchemaSha256:digestJson(sortDescriptors(currentObservation.catalog)),currentLedgerSha256:digestJson(currentObservation.ledger),
  historicalObjectCount:historical.size,currentObjectCount:current.size,changedDescriptorCount:m.changes.length});
}

export async function verifyExecuteTransitionObservation({packet,historicalObservation,currentObservation}){
 assertOperatorPacket(packet);
 const root=new URL('../',import.meta.url);
 const [manifestBytes,migrationBytes]=await Promise.all([
  readFile(new URL(EXECUTE_TRANSITION_MANIFEST,root)),readFile(new URL(EXECUTE_TRANSITION_MIGRATION,root)),
 ]);
 if(manifestBytes.length>131072||migrationBytes.length>1048576)fail();
 let manifest,migrationSql;
 try{manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(manifestBytes));migrationSql=new TextDecoder('utf8',{fatal:true}).decode(migrationBytes);}catch{fail();}
 return assertExecuteTransitionWithManifest({packet,historicalObservation,currentObservation,manifest,migrationSql});
}
