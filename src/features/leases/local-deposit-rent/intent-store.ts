import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import type { DepositRentDraft } from "./contracts";
export type LocalDepositIntent={token:string;idempotencyKey:string;draft:DepositRentDraft;snapshotHash:string;scopeHash:string;identityHash:string;amount:string;expires:number;
  state:"preview"|"attempted"|"resolved";message?:string};
export type IntentScope={organizationId:string;actorId:string;leaseId:string};
export type LocalDepositIntentStore={withLease<T>(scope:IntentScope,body:(journal:{read():LocalDepositIntent|null;save(record:LocalDepositIntent):Promise<void>})=>Promise<T>):Promise<T>};
const uuid=z.uuid();const intentSchema=z.strictObject({token:uuid,idempotencyKey:uuid,draft:z.strictObject({operation:z.enum(["apply","reverse"]),leaseId:uuid,date:z.iso.date(),reason:z.string().min(3).max(200),depositId:uuid.optional(),invoiceId:uuid.optional(),lineId:uuid.optional(),amount:z.string().regex(/^\d{1,12}\.\d{2}$/).optional(),applicationId:uuid.optional()}),
  amount:z.string().regex(/^\d{1,12}\.\d{2}$/),snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),scopeHash:z.string().regex(/^[a-f0-9]{64}$/),identityHash:z.string().regex(/^[a-f0-9]{64}$/),expires:z.number().finite(),state:z.enum(["preview","attempted","resolved"]),message:z.string().optional()}).refine(record=>record.state!=="resolved"||Boolean(record.message));
// Synthetic local persistence only; never a production storage/default-directory
// choice. A server-owned directory is required. No credentials in records.
// Atomic rename + synced file protects normal process restart; stale lock files
// fail closed and require local operator review, never automatic lock stealing.
export function createFileLocalDepositIntentStore(serverOwnedDirectory:string):LocalDepositIntentStore {
  const root=resolve(serverOwnedDirectory);
  return {async withLease(scope,body){
    uuid.parse(scope.organizationId);uuid.parse(scope.actorId);uuid.parse(scope.leaseId);
    const slug=createHash("sha256").update(JSON.stringify(scope)).digest("hex");
    await mkdir(root,{recursive:true});const file=join(root,`${slug}.json`),lock=join(root,`${slug}.lock`);
    const handle=await open(lock,"wx");
    try{
      let current:LocalDepositIntent|null=null;
      try{const packet=JSON.parse(await readFile(file,"utf8"));if(JSON.stringify(packet.scope)!==JSON.stringify(scope))throw Error("Intent scope mismatch");current=intentSchema.parse(packet.intent);if(current.draft.leaseId!==scope.leaseId)throw Error("Intent lease mismatch");}
      catch(error){if(!(error instanceof Error&&"code" in error&&error.code==="ENOENT"))throw error;}
      return await body({read:()=>current,save:async(record)=>{
        const checked=intentSchema.parse(record);if(checked.draft.leaseId!==scope.leaseId)throw Error("Intent lease mismatch");
        const temporary=join(root,`${slug}.${randomUUID()}.tmp`);const writer=await open(temporary,"wx");
        try{await writer.writeFile(JSON.stringify({scope,intent:checked}),"utf8");await writer.sync();}finally{await writer.close();}
        try{await rename(temporary,file);}catch(error){await unlink(temporary);throw error;}current=checked;
      }});
    }finally{await handle.close();await unlink(lock);}
  }};
}
