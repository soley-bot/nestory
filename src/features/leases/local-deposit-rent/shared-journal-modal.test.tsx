/* @vitest-environment jsdom */
import {cleanup,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {SharedJournalDepositRentModal,DormantSharedJournalDepositRentModal} from "./shared-journal-modal";
import {ids,id} from "./workflow.test-fixture";
import {sharedModalFixture} from "./shared-journal-modal.fixture";
// Real Modal, SelectControl, DatePickerField, Input and Button. Only missing DOM
// platform primitives are supplied; no component/action mock replaces the UI.
beforeAll(()=>{vi.stubGlobal("ResizeObserver",class{disconnect(){}observe(){}unobserve(){}});Object.defineProperties(HTMLElement.prototype,{hasPointerCapture:{configurable:true,value:()=>false},releasePointerCapture:{configurable:true,value:()=>undefined},setPointerCapture:{configurable:true,value:()=>undefined},scrollIntoView:{configurable:true,value:()=>undefined}});});
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));});
afterEach(()=>{cleanup();vi.useRealTimers();});
async function prepare(user:ReturnType<typeof userEvent.setup>){
  await screen.findByRole("combobox",{name:"Deposit"});
  await user.click(screen.getByRole("combobox",{name:"Deposit"}));await user.click(screen.getByRole("option",{name:/^Security deposit/}));
  await user.click(screen.getByRole("combobox",{name:"Invoice"}));await user.click(screen.getByRole("option",{name:/^October rent invoice/}));
  await user.click(screen.getByRole("combobox",{name:"Rent line"}));await user.click(screen.getByRole("option",{name:/^October rent/}));
  await user.click(screen.getByRole("button",{name:"Application date"}));
  // The picker opens on the authorized November business date, independent of
  // this test's October device clock. Select the earlier application explicitly.
  await user.click(screen.getByRole("button",{name:"Previous month"}));
  const day=screen.getByRole("grid").querySelector('[data-day="2026-10-05"] button');if(!day)throw Error("Expected real calendar day");await user.click(day);
  await user.type(screen.getByRole("textbox",{name:"Reason"}),"Settle October rent");await user.click(screen.getByRole("button",{name:"Preview changes"}));
  return await screen.findByRole("button",{name:"Confirm deposit application"});
}
describe("actual product controls bound to dormant shared-journal workflow",()=>{
 it("reopens controls after a proved rejection and prepares a new identity without reporting success",async()=>{
  const f=sharedModalFixture(),user=userEvent.setup(),success=vi.fn();render(<SharedJournalDepositRentModal enabledForLocalTests leaseId={ids.lease} actions={f.actions} onClose={vi.fn()} onSuccess={success}/>);
  const button=await prepare(user),original=f.current()!;f.control.definitiveRejection=true;await user.click(button);
  await screen.findByText(/No changes from this attempt were saved/);expect(f.current()!.state).toBe("rejected");expect(success).not.toHaveBeenCalled();
  expect(screen.queryByRole("button",{name:/Retry original/})).toBeNull();
  f.control.definitiveRejection=false;await user.click(screen.getByRole("button",{name:"Preview changes"}));await screen.findByRole("button",{name:"Confirm deposit application"});
  expect(f.current()!.token).not.toBe(original.token);expect(f.current()!.idempotencyKey).not.toBe(original.idempotencyKey);
  await user.click(screen.getByRole("button",{name:"Confirm deposit application"}));await waitFor(()=>expect(success).toHaveBeenCalledTimes(1));
 });
 it.each(["ips","owner"] as const)("uses the original %s custodian after switching from an unrelated apply selection",async custodian=>{
  const f=sharedModalFixture(custodian),user=userEvent.setup();
  const applied=await f.h.rpc("apply_deposit_to_rent",{p_org:ids.org,p_deposit:ids.deposit,p_invoice:ids.invoice,p_date:"2026-10-05",p_allocations:[{lineId:ids.line,amount:"100.00"}],p_reason:"Synthetic original application",p_key:"copy-original-application"});expect(applied.error).toBeNull();
  const actions={...f.actions,list:async(leaseId:string)=>{
    const result=await f.actions.list(leaseId);if(result.status==="success")result.value.deposits.unshift({id:id(999),label:"Other deposit",amount:"500.00",eligible:true,custodianLabel:custodian==="ips"?"The owner holds the deposit":"IPS holds the deposit"});return result;
  }};
  render(<SharedJournalDepositRentModal enabledForLocalTests leaseId={ids.lease} actions={actions} onClose={vi.fn()} onSuccess={vi.fn()}/>);
  await user.click(await screen.findByRole("combobox",{name:"Deposit"}));await user.click(screen.getByRole("option",{name:/^Other deposit/}));
  await user.click(screen.getByRole("combobox",{name:"Action"}));await user.click(screen.getByRole("option",{name:"Reverse a full application"}));
  await user.click(screen.getByRole("combobox",{name:"Original application"}));await user.click(screen.getByRole("option",{name:/USD 100\.00/}));
  await user.click(screen.getByRole("button",{name:"Reversal date"}));await user.click(screen.getByRole("button",{name:"Today"}));
  await user.type(screen.getByRole("textbox",{name:"Reason"}),"Verify original custody explanation");await user.click(screen.getByRole("button",{name:"Preview changes"}));
  await screen.findByRole("button",{name:"Confirm full reversal"});
  expect(screen.getByText(custodian==="owner"?"No new bank payment. Owner-held money does not increase money held by IPS.":"No new bank payment. Already-held deposit money is reclassified for the owner.")).toBeTruthy();
 });
 it("refreshes only a proven unused stale preview and preserves explicit draft details",async()=>{
  const f=sharedModalFixture(),user=userEvent.setup(),success=vi.fn();render(<SharedJournalDepositRentModal enabledForLocalTests leaseId={ids.lease} actions={f.actions} onClose={vi.fn()} onSuccess={success}/>);
  const button=await prepare(user),oldKey=f.current()!.idempotencyKey;const snapshot=f.h.snapshot.bind(f.h);vi.spyOn(f.h,"snapshot").mockImplementation(()=>({...snapshot(),businessDate:"2026-10-06"}));f.control.businessConflict=true;await user.click(button);
  await screen.findByText(/unused preview changed or expired/i);expect(screen.queryByRole("button",{name:"Retry original action"})).toBeNull();expect((screen.getByRole("textbox",{name:"Reason"}) as HTMLInputElement).value).toBe("Settle October rent");
  expect(f.current()!.state).toBe("preview");expect(f.h.getState().held).toBe("500.00");expect(f.port.executeOriginal).not.toHaveBeenCalled();
  expect(document.querySelector('input[name="date"]')).toHaveProperty("value","2026-10-05");await user.click(screen.getByRole("button",{name:"Application date"}));await user.click(screen.getByRole("button",{name:"Today"}));expect(document.querySelector('input[name="date"]')).toHaveProperty("value","2026-10-06");
  f.control.businessConflict=false;await user.click(screen.getByRole("button",{name:"Preview changes"}));await user.click(await screen.findByRole("button",{name:"Confirm deposit application"}));await waitFor(()=>expect(success).toHaveBeenCalledTimes(1));
  expect(f.current()!.idempotencyKey).not.toBe(oldKey);expect(f.h.getState().held).toBe("200.00");
 });
 it("keeps attempted unknown work immutable and recovers its original key after service restoration",async()=>{
  const f=sharedModalFixture(),user=userEvent.setup(),success=vi.fn();render(<SharedJournalDepositRentModal enabledForLocalTests leaseId={ids.lease} actions={f.actions} onClose={vi.fn()} onSuccess={success}/>);
  const button=await prepare(user),key=f.current()!.idempotencyKey;f.control.lostBeforeExecute=true;await user.click(button);await screen.findByText(/action could not be confirmed/i);
  expect(f.current()!.state).toBe("attempted");expect(screen.queryByRole("textbox",{name:"Reason"})).toBeNull();expect(f.h.getState().held).toBe("500.00");
  const blocked=await f.actions.preview({operation:"apply",leaseId:ids.lease,depositId:ids.deposit,invoiceId:ids.invoice,lineId:ids.line,amount:"100.00",date:"2026-10-05",reason:"Different action"});expect(blocked.status).toBe("error");expect(f.current()!.idempotencyKey).toBe(key);
  f.control.lostBeforeExecute=false;await user.click(screen.getByRole("button",{name:"Retry original action"}));await waitFor(()=>expect(success).toHaveBeenCalledTimes(1));expect(f.current()!.idempotencyKey).toBe(key);expect(f.h.getState().held).toBe("200.00");
 });
 it.each(["ips","owner"] as const)("reconciles resolved lost-response %s application without a second posting",async custodian=>{
  const f=sharedModalFixture(custodian),user=userEvent.setup(),success=vi.fn();const rendered=render(<SharedJournalDepositRentModal enabledForLocalTests leaseId={ids.lease} actions={f.actions} onClose={vi.fn()} onSuccess={success}/>);
  const button=await prepare(user),key=f.current()!.idempotencyKey;f.control.lostAfterCommit=true;await user.click(button);await screen.findByText(/action could not be confirmed/i);expect(f.current()!.state).toBe("resolved");
  await user.click(screen.getByRole("button",{name:"Retry original action"}));await waitFor(()=>expect(success).toHaveBeenCalledTimes(1));expect(f.current()!.idempotencyKey).toBe(key);expect(f.h.rpc.mock.calls.filter(([name])=>name==="apply_deposit_to_rent")).toHaveLength(1);
  rendered.unmount();render(<SharedJournalDepositRentModal enabledForLocalTests leaseId={ids.lease} actions={f.actions} onClose={vi.fn()} onSuccess={success}/>);await screen.findByText("Deposit applied to rent. No new bank payment was recorded.");expect(screen.queryByRole("button",{name:"Retry original action"})).toBeNull();
 });
 it("shows unavailable service without permitting a fresh draft, while production mount never calls actions",async()=>{
  const f=sharedModalFixture();f.control.outage=true;const shown=render(<SharedJournalDepositRentModal enabledForLocalTests leaseId={ids.lease} actions={f.actions} onClose={vi.fn()} onSuccess={vi.fn()}/>);await screen.findByText(/action could not be confirmed/i);expect(screen.queryByRole("textbox",{name:"Reason"})).toBeNull();expect(f.port.prepare).not.toHaveBeenCalled();shown.unmount();
  render(<DormantSharedJournalDepositRentModal leaseId={ids.lease} onClose={vi.fn()} onSuccess={vi.fn()}/>);expect(screen.getByText("Deposit rent workflow is disabled.")).toBeTruthy();expect(f.port.readCurrent).not.toHaveBeenCalled();
 });
});
