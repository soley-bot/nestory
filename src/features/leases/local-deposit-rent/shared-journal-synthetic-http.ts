import "server-only";
import { z } from "zod";
import type { SharedDepositJournalPort } from "./shared-journal-contract";
import { sharedJournalPayloadSchema } from "./shared-journal-contract";
import { SharedJournalError } from "./shared-journal-adapter";
const uuid=z.uuid(),proof=z.strictObject({token:uuid,idempotencyKey:uuid,payloadHash:z.string().regex(/^[a-f0-9]{64}$/),revision:z.number().int().positive()});
const requestSchema=z.discriminatedUnion("operation",[
 z.strictObject({operation:z.literal("read"),leaseId:uuid}),z.strictObject({operation:z.literal("prepare"),payload:sharedJournalPayloadSchema}),
 z.strictObject({operation:z.literal("begin"),leaseId:uuid,proof}),z.strictObject({operation:z.literal("execute"),leaseId:uuid,proof})]);
export type SyntheticJournalBarrier=(phase:"durable-attempt"|"before-dispatch"|"durable-resolution-before-response",token:string)=>Promise<void>;
// Reusable ONLY in a separately owned loopback harness route. No route/action
// is mounted here. Fault hooks are server-owned closures, never request flags;
// they delay/drop delivery after actual RPCs and never fake financial results.
export function createSyntheticJournalHttpHandler(port:()=>SharedDepositJournalPort,barrier?:SyntheticJournalBarrier){
 return async(request:Request):Promise<Response>=>{
  const headers={"Cache-Control":"no-store","Content-Type":"application/json"};
  const error=(status:number,message:string)=>new Response(JSON.stringify({error:message}),{status,headers});
  const url=new URL(request.url);
  if(request.method!=="POST")return error(405,"POST required.");
  if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||request.headers.get("origin")!==url.origin)return error(403,"Synthetic loopback same-origin request required.");
  try{
   const reader=request.body?.getReader();if(!reader)return error(400,"Request body required.");let size=0;const chunks:Uint8Array[]=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return error(413,"Request too large.");}chunks.push(value);}
   const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
   const body=requestSchema.safeParse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));if(!body.success)return error(400,"Invalid explicit journal request.");
   const input=body.data,actions=port();let record;
   if(input.operation==="read")record=await actions.readCurrent(input.leaseId);
   else if(input.operation==="prepare")record=await actions.prepare(input.payload);
   else if(input.operation==="begin"){record=await actions.beginAttempt(input.leaseId,input.proof);await barrier?.("durable-attempt",record.token);}
   else {await barrier?.("before-dispatch",input.proof.token);record=await actions.executeOriginal(input.leaseId,input.proof);await barrier?.("durable-resolution-before-response",record.token);}
   return new Response(JSON.stringify({record}),{status:200,headers});
  }catch(caught){return error(caught instanceof SharedJournalError?caught.status:503,"The outcome could not be confirmed. Retry the original saved details.");}
 };
}
