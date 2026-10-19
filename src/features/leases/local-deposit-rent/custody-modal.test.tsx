/* @vitest-environment jsdom */
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({list:vi.fn(),save:vi.fn()}));
vi.mock("./custody-actions",()=>({getDepositCustodyOptions:mocks.list,confirmDepositCustody:mocks.save}));
vi.mock("@/components/ui/date-picker-field",()=>({DatePickerField:(p:{ariaLabel:string;name:string;onValueChange:(v:string)=>void})=><input aria-label={p.ariaLabel} name={p.name} onChange={e=>p.onValueChange(e.target.value)}/>}));
vi.mock("@/components/ui/select-control",()=>({SelectControl:(p:{ariaLabel:string;name:string;value?:string;options:{value:string;label:string}[];onValueChange?:(v:string)=>void})=><select aria-label={p.ariaLabel} name={p.name} value={p.value} onChange={e=>p.onValueChange?.(e.target.value)}><option value="">Choose</option>{p.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
import {DepositCustodyModal} from "./custody-modal";
beforeEach(()=>{vi.clearAllMocks();mocks.list.mockResolvedValue({status:"success",businessDate:"2026-10-01",fingerprint:"f",owners:[],deposits:[{id:"d",label:"Deposit",held:"50.00"}]});});
afterEach(cleanup);
function show(close=vi.fn(),success=vi.fn()){render(<DepositCustodyModal leaseId="lease" accounts={[{id:"a",displayName:"Liability"}]} onClose={close} onSuccess={success}/>);return {close,success};}
async function prepare(){await screen.findByLabelText("Deposit to verify");for(const [label,value] of [["Deposit to verify","d"],["Deposit custodian","ips"],["Custody liability account","a"],["Custody verification date","2026-10-01"],["Verified deposit held","50.00"],["Custody evidence reference","Bank record 123"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});}
it("guards a dirty footer close, pending Escape and failed original retry, then cleans success",async()=>{
 let finish!:(v:{status:string;message:string})=>void;mocks.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({status:"success",message:"Saved"});
 const {close,success}=show();await prepare();fireEvent.click(screen.getByRole("button",{name:/^Close$/}));expect(screen.getByRole("alertdialog",{name:"Discard unsaved changes?"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Keep editing"}));
 fireEvent.submit(screen.getByRole("button",{name:"Confirm existing deposit custody"}).closest("form")!);await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());const original=mocks.save.mock.calls[0][0];
 expect((screen.getByRole("button",{name:/^Close$/}) as HTMLButtonElement).disabled).toBe(true);fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});expect(close).not.toHaveBeenCalled();fireEvent.click(await screen.findByRole("button",{name:"Continue waiting"}));
 finish({status:"error",message:"Unconfirmed"});await screen.findByText("Unconfirmed");fireEvent.click(screen.getByRole("button",{name:"Close modal"}));expect(screen.getByRole("alertdialog",{name:"Discard unsaved changes?"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Keep editing"}));fireEvent.click(screen.getByRole("button",{name:"Retry original custody confirmation"}));await waitFor(()=>expect(success).toHaveBeenCalledWith("Saved"));expect(mocks.save.mock.calls[1][0]).toEqual(original);
 fireEvent.click(screen.getByRole("button",{name:/^Close$/}));expect(close).toHaveBeenCalledOnce();
});
it("allows dismissal after an initial loading error",async()=>{mocks.list.mockResolvedValue({status:"error",message:"Unavailable"});const {close}=show();await screen.findByText("Unavailable");fireEvent.click(screen.getByRole("button",{name:/^Close$/}));expect(close).toHaveBeenCalledOnce();});

