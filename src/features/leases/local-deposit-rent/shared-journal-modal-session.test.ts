import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readBoundary: vi.fn(), user: vi.fn(), member: vi.fn(), client: vi.fn(), snapshot: vi.fn(), parse: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialIntentReadContext: mocks.readBoundary }));
vi.mock("@/lib/auth/context", () => ({ getCurrentUser: mocks.user, getWorkspaceMembershipForUser: mocks.member }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("./candidate-reader", () => ({ readLocalDepositRentSnapshot: mocks.snapshot, parseLocalDepositCandidates: mocks.parse }));
vi.mock("./shared-journal-session", () => ({ createOrdinarySharedJournalSession: vi.fn() }));
vi.mock("./shared-journal-workflow", () => ({ createSharedJournalWorkflow: (deps: object) => ({...deps,list:mocks.list}), createDisabledSharedJournalWorkflow: vi.fn() }));
import { createOrdinarySharedJournalModalSession } from "./shared-journal-modal-session";
function reader(intent?: FormData) {
  return (createOrdinarySharedJournalModalSession(intent) as unknown as { readSnapshot(leaseId: string): Promise<unknown> }).readSnapshot;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.readBoundary.mockReset(); mocks.readBoundary.mockImplementation(async (_org, _intent, read) => read());
  mocks.user.mockResolvedValue({ id: "actor" }); mocks.member.mockResolvedValue({ organizationId: "org", permissionKeys: new Set(["leases.view"]) });
  mocks.client.mockResolvedValue({}); mocks.snapshot.mockResolvedValue({ actorId: "actor" }); mocks.parse.mockImplementation(value => value);
  mocks.list.mockResolvedValue({status:"success",value:{leaseLabel:"Synthetic lease"}});
});
it("rejects obsolete intent before reading a deposit snapshot", async () => {
  mocks.readBoundary.mockRejectedValueOnce(new Error("The financial session changed"));
  await expect(reader()("lease")).rejects.toThrow("session changed");
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
it("pins original intent and discards a snapshot changed during the read", async () => {
  const intent = new FormData(); intent.set("__financialGeneration", "1");
  mocks.readBoundary.mockImplementationOnce(async (_org, _intent, read) => { await read(); throw new Error("Financial data changed while loading"); });
  await expect(reader(intent)("lease")).rejects.toThrow("changed while");
  expect(mocks.readBoundary).toHaveBeenCalledWith("org", intent, expect.any(Function));
  expect(mocks.client).toHaveBeenCalledWith(intent);
  expect(mocks.snapshot).toHaveBeenCalledOnce();
});
it("retains the snapshot actor check inside the guarded read", async () => {
  mocks.snapshot.mockResolvedValue({ actorId: "other" });
  await expect(reader()("lease")).rejects.toThrow("Actor mismatch");
});
it("guards the complete list including the journal read after candidates",async()=>{
 const intent=new FormData();intent.set("__financialGeneration","1");
 mocks.readBoundary.mockImplementationOnce(async(_org,_intent,read)=>{await read();throw Error("Financial data changed while loading the original journal");});
 await expect(createOrdinarySharedJournalModalSession(intent).list("lease")).resolves.toMatchObject({status:"error"});
 expect(mocks.readBoundary).toHaveBeenCalledWith("org",intent,expect.any(Function));
 expect(mocks.list).toHaveBeenCalledWith("lease");
});
it("does not run the list when its original intent is obsolete",async()=>{
 mocks.readBoundary.mockRejectedValueOnce(Error("The financial session changed"));
 await expect(createOrdinarySharedJournalModalSession().list("lease")).resolves.toMatchObject({status:"error"});
 expect(mocks.list).not.toHaveBeenCalled();
});
