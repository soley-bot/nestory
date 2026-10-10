"use client";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {DatePickerField} from "@/components/ui/date-picker-field";
import {Input} from "@/components/ui/input";
import {Modal} from "@/components/ui/modal";
import {SelectControl} from "@/components/ui/select-control";
import type {DepositRentDraft,DepositRentPreview,DepositRentRecovery} from "./contracts";
import {listDormantDepositRent,previewDormantDepositRent,confirmDormantDepositRent} from "./shared-journal-product-actions";
import {listDepositRent,previewDepositRent,confirmDepositRent} from "./shared-journal-product-actions";
import type {SharedJournalActions,SharedJournalView} from "./shared-journal-workflow";
// Shared backend variant of existing controls; frozen original is unchanged.
function SharedDepositRentModalContent({leaseId,actions,onClose,onSuccess}:{leaseId:string;actions:SharedJournalActions;onClose:()=>void;onSuccess:(message:string)=>void;enabledForLocalTests?:boolean}){
  const [view,setView]=useState<SharedJournalView|null>(null),[operation,setOperation]=useState<"apply"|"reverse">("apply");
  const [depositId,setDepositId]=useState(""),[invoiceId,setInvoiceId]=useState(""),[selection,setSelection]=useState("");
  const [date,setDate]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState("");
  const [preview,setPreview]=useState<DepositRentPreview|null>(null),[recovery,setRecovery]=useState<DepositRentRecovery|null>(null);
  const [message,setMessage]=useState<string|null>(null),[pending,setPending]=useState(false);
  const revision=useRef(0),busy=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;revision.current+=1;};},[]);
  useEffect(()=>{let active=true;revision.current+=1;
    actions.list(leaseId).then(result=>{if(!active)return;if(result.status==="error"){setMessage(result.message);return;}
      setView(result.value);if(result.value.lastResolvedMessage)setMessage(result.value.lastResolvedMessage);setOperation(result.value.canApply?"apply":"reverse");setRecovery(result.value.recovery??null);
    }).catch(()=>{if(active)setMessage("Deposit rent details could not be loaded. Reload the lease.");});
    return()=>{active=false;revision.current+=1;};
  },[actions,leaseId]);
  function invalidate(){if(recovery)return;revision.current+=1;setPreview(null);setMessage(null);}
  async function review(){
    if(busy.current||recovery)return;busy.current=true;setPending(true);setMessage(null);setPreview(null);const current=revision.current;
    const draft:DepositRentDraft=operation==="apply"?{operation,leaseId,depositId,invoiceId,date,reason,lineId:selection,amount}:{operation,leaseId,date,reason,applicationId:selection};
    try{const result=await actions.preview(draft);if(!alive.current||current!==revision.current)return;if(result.status==="error")setMessage(result.message);else setPreview(result.value);}
    catch{if(alive.current&&current===revision.current)setMessage("The preview could not be loaded. Your details are still here; try again.");}
    finally{busy.current=false;if(alive.current)setPending(false);}
  }
  async function confirm(){
    const original=recovery??(preview?{...preview,reason}:null);if(!original||busy.current)return;
    busy.current=true;setPending(true);setMessage(null);setRecovery(original);setPreview(null);const current=revision.current;
    try{const result=await actions.confirm({leaseId,token:original.token,idempotencyKey:original.idempotencyKey});if(!alive.current||current!==revision.current)return;
      if(result.status==="success"){setRecovery(null);setView(null);setMessage(result.value.message);onSuccess(result.value.message);}else {let nextMessage=result.message;if(result.recoveryState==="unused"){const refreshed=await actions.list(leaseId);if(!alive.current||current!==revision.current)return;if(refreshed.status==="success"){setView(refreshed.value);setRecovery(refreshed.value.recovery??null);setPreview(null);nextMessage=refreshed.value.lastResolvedMessage??result.message;}}setMessage(nextMessage);}
    }catch{if(alive.current&&current===revision.current)setMessage("The original action is unconfirmed. Reopen this lease and retry it before making another change.");}
    finally{busy.current=false;if(alive.current)setPending(false);}
  }
  const deposit=view?.deposits.find(row=>row.id===depositId),invoice=view?.invoices.find(row=>row.id===invoiceId);
  const choices=operation==="apply"?invoice?.rentLines:view?.applications;
  return <Modal open title="Use deposit for rent" description="Apply existing deposit money to rent, or reverse a full application." onClose={()=>{if(!busy.current)onClose();}}>
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">Use money already held as a deposit to settle rent. No new bank payment is recorded. Reversal restores the full original application.</p>
      {recovery?<section aria-label="Unconfirmed original action" className="space-y-3">
        <p role="status">An earlier action is unconfirmed. Retry its original details before making another change. Retrying may finish that original action or confirm it already completed.</p>
        <p>{recovery.operation==="apply"?"Apply":"Restore"} USD {recovery.amount} on {recovery.date}. Reason: {recovery.reason}</p>
        <Button type="button" disabled={pending} onClick={()=>void confirm()}>Retry original action</Button>
      </section>:view?<form className="space-y-4" onSubmit={event=>{event.preventDefault();void review();}}>
        <p>{view.leaseLabel}</p>
        <fieldset disabled={pending} className="space-y-4">
          <label className="grid gap-1.5 text-sm font-medium">Action<SelectControl ariaLabel="Action" name="operation" value={operation} options={[
            ...(view.canApply?[{value:"apply",label:"Apply deposit to rent"}]:[]),...(view.canReverse?[{value:"reverse",label:"Reverse a full application"}]:[])]}
            onValueChange={value=>{invalidate();setOperation(value==="reverse"?"reverse":"apply");setSelection("");setDate("");setAmount("");}}/></label>
          {operation==="apply"?<>
            <label className="grid gap-1.5 text-sm font-medium">Deposit<SelectControl ariaLabel="Deposit" name="depositId" value={depositId} required placeholder="Choose a deposit" options={view.deposits.map(row=>({value:row.id,label:`${row.label} · USD ${row.amount} available · ${row.custodianLabel}${row.eligible?"":" · unavailable"}`,disabled:!row.eligible}))}
              onValueChange={value=>{invalidate();setDepositId(value);}}/></label>
            {deposit?<p>{deposit.custodianLabel}. Available deposit: USD {deposit.amount}.</p>:null}
            {view.deposits.some(row=>!row.eligible)?<p className="text-sm text-muted-foreground">Unavailable deposits need confirmed custody and matching owner allocations, with one unchanged owner. Review deposit custody and the property’s owner balances before applying rent.</p>:null}
            <label className="grid gap-1.5 text-sm font-medium">Invoice<SelectControl ariaLabel="Invoice" name="invoiceId" value={invoiceId} required placeholder="Choose an issued invoice" options={view.invoices.filter(row=>row.issued).map(row=>({value:row.id,label:`${row.label} · USD ${row.amount} due`,disabled:row.amount==="0.00"}))}
              onValueChange={value=>{invalidate();setInvoiceId(value);setSelection("");setAmount("");}}/></label>
          </>:null}
          <label className="grid gap-1.5 text-sm font-medium">{operation==="apply"?"Rent line":"Original application"}<SelectControl ariaLabel={operation==="apply"?"Rent line":"Original application"} name="selection" value={selection} required placeholder="Choose explicitly" options={(choices??[]).map(row=>({value:row.id,label:`${row.label} · USD ${row.amount}`,disabled:operation==="apply"&&row.amount==="0.00"}))}
            onValueChange={value=>{invalidate();setSelection(value);setAmount(choices?.find(row=>row.id===value)?.amount??"");}}/></label>
          {operation==="apply"?<label className="grid gap-1.5 text-sm font-medium">Amount (USD)<Input aria-label="Amount (USD)" value={amount} inputMode="decimal" required onChange={event=>{invalidate();setAmount(event.target.value);}}/></label>:<p>The full original amount will be restored; partial reversal is unavailable.</p>}
          <label className="grid gap-1.5 text-sm font-medium">{operation==="apply"?"Application date":"Reversal date"}<DatePickerField key={`${leaseId}:${operation}`} ariaLabel={operation==="apply"?"Application date":"Reversal date"} name="date" defaultValue={date} businessDate={view.businessDate} required onValueChange={value=>{invalidate();setDate(value);}}/></label>
          <label className="grid gap-1.5 text-sm font-medium">Reason<Input aria-label="Reason" value={reason} required minLength={3} maxLength={200} onChange={event=>{invalidate();setReason(event.target.value);}}/></label>
          <Button type="submit" variant="outline" disabled={pending||!selection||!date||reason.trim().length<3||reason.trim().length>200||operation==="apply"&&(!depositId||!invoiceId)}>{pending?"Working…":"Preview changes"}</Button>
        </fieldset>
        {preview?<div className="space-y-3 border-t border-border pt-3 text-sm">
          <p>{operation==="apply"?"Apply":"Restore"} USD {preview.amount} on {preview.date}.</p>
          <dl className="grid grid-cols-2 gap-2"><dt>Deposit held after</dt><dd>USD {preview.heldAfter}</dd><dt>Invoice due after</dt><dd>USD {preview.outstandingAfter}</dd><dt>Owner money held by IPS: change</dt><dd>USD {preview.ownerCashChange}</dd></dl>
          <p>No new bank payment. {deposit?.custodianLabel==="The owner holds the deposit"?"Owner-held money does not increase money held by IPS.":"Already-held deposit money is reclassified for the owner."}</p>
          <Button type="button" disabled={pending} onClick={()=>void confirm()}>{operation==="apply"?"Confirm deposit application":"Confirm full reversal"}</Button>
        </div>:null}
      </form>:!message?<p role="status">Loading deposit rent details.</p>:null}
      {message?<p role="status">{message}</p>:null}<Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Close</Button>
    </div>
  </Modal>;
}
export function SharedJournalDepositRentModal(props:Parameters<typeof SharedDepositRentModalContent>[0]){
  if(!props.enabledForLocalTests)return <p role="status">Deposit rent workflow is disabled.</p>;
  return <SharedDepositRentModalContent key={props.leaseId} {...props}/>;
}

export function DormantSharedJournalDepositRentModal(props:Omit<Parameters<typeof SharedDepositRentModalContent>[0],"enabledForLocalTests"|"actions">){return <SharedJournalDepositRentModal {...props} actions={{list:listDormantDepositRent,preview:previewDormantDepositRent,confirm:confirmDormantDepositRent}} enabledForLocalTests={false}/>;}

const productActions = {list:listDepositRent,preview:previewDepositRent,confirm:confirmDepositRent};
export function DepositRentModal(props:Omit<Parameters<typeof SharedDepositRentModalContent>[0],"enabledForLocalTests"|"actions">) {
  return <SharedDepositRentModalContent {...props} actions={productActions}/>;
}
