// Saved aggregate witness for the existing private-C handoff flow. No hosted
// calls or execution permission. The producer and consumer use the same fixed
// archive reader, source files, and held plaintext-custody lease.
import {randomUUID} from 'node:crypto';
import {backupHash,encryptLocalBackup,decryptLocalBackup,readPrivateBackupFile,writePrivateBackupFile} from './local-backup-crypto.mjs';
import {inspectSavedPilotRehearsal,assertSavedPilotRehearsalHeld,readPilotLiveMigrationSources} from './local-backup-saved-rehearsal.mjs';
import {assertBusinessRehearsalInputReference} from './local-backup-business-runtime.mjs';
import {createPilotLiveWitnessBuilder,bindPilotLiveRehearsal} from './local-backup-live-witness.mjs';
import {digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {assertLocalDispatchCompatibilityCurrent,readLocalDispatchCompatibleSources} from './local-backup-dispatch-repair.mjs';
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const fail=()=>{throw Error('local_saved_live_witness_unverified')};
export function bindSavedPilotLiveWitness({context,value,sourceFiles}){
 const saved=inspectSavedPilotRehearsal(context);
 try{
  if(!exact(value,['format','businessArchive','operationId','witness','hostedLedgerText'])||value.format!=='nestory-local-live-witness-inputs-v1'||
   digestDatabaseJson(value.businessArchive)!==digestDatabaseJson(saved.request)||value.operationId!==context.operationId)fail();
  const builder=createPilotLiveWitnessBuilder({manifestBytes:saved.manifestBytes,expectedSourceSha256:context.sourceSha256,operationId:context.operationId});
  const witness=builder.accept(value.witness,saved.plan);
  return bindPilotLiveRehearsal({plan:saved.plan,witness,hostedLedgerText:value.hostedLedgerText,sourceFiles});
 }finally{saved.manifestBytes.fill(0)}
}
export async function persistPilotLiveWitnessInputs({context,witness,hostedLedgerText}){
 witness=structuredClone(witness);
 await assertSavedPilotRehearsalHeld(context);const saved=inspectSavedPilotRehearsal(context);saved.manifestBytes.fill(0);
 const value={format:'nestory-local-live-witness-inputs-v1',businessArchive:saved.request,operationId:context.operationId,witness,hostedLedgerText};
 bindSavedPilotLiveWitness({context,value,sourceFiles:await readPilotLiveMigrationSources()});
 const bytes=Buffer.from(JSON.stringify(value)),archiveId=randomUUID(),keyId=saved.request.keyId;let cipher;
 try{
  if(bytes.length>4*1024*1024)fail();cipher=await encryptLocalBackup(keyId,bytes);await assertSavedPilotRehearsalHeld(context);
  await writePrivateBackupFile(archiveId,'archive.pgp',cipher);const readback=await readPrivateBackupFile(archiveId,'archive.pgp');
  try{if(!readback.equals(cipher))fail()}finally{readback.fill(0)}
  await assertSavedPilotRehearsalHeld(context);
  return Object.freeze({keyId,archiveId,archiveSha256:backupHash(cipher),plaintextSha256:backupHash(bytes),plaintextBytes:bytes.length});
 }finally{bytes.fill(0);cipher?.fill(0)}
}
export async function openPilotLiveWitnessInputs({context,reference},options){
 if(options!==undefined){
  if(!exact(options,['compatibility','packet']))fail();
  options={compatibility:options.compatibility,packet:structuredClone(options.packet)};
  await assertLocalDispatchCompatibilityCurrent(options.compatibility,options.packet);
 }
 reference=structuredClone(reference);
 await assertSavedPilotRehearsalHeld(context);const saved=inspectSavedPilotRehearsal(context);saved.manifestBytes.fill(0);
 assertBusinessRehearsalInputReference(reference,saved.request.keyId);if(reference.plaintextBytes>4*1024*1024)fail();let cipher,plain;
 try{
  cipher=await readPrivateBackupFile(reference.archiveId,'archive.pgp');if(backupHash(cipher)!==reference.archiveSha256)fail();plain=await decryptLocalBackup(reference.keyId,cipher);
  if(plain.length!==reference.plaintextBytes||backupHash(plain)!==reference.plaintextSha256)fail();const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(plain));
  // An archived witness keeps its original ledger. Only the authenticated
  // compatibility receipt can supply that ledger's original source bytes;
  // current-schema admission remains a separate execution-transition check.
  const sourceFiles=options===undefined?await readPilotLiveMigrationSources():readLocalDispatchCompatibleSources(options.compatibility);
  const binding=bindSavedPilotLiveWitness({context,value,sourceFiles});
  if(options!==undefined)await assertLocalDispatchCompatibilityCurrent(options.compatibility,options.packet);
  await assertSavedPilotRehearsalHeld(context);return binding;
 }finally{cipher?.fill(0);plain?.fill(0)}
}
