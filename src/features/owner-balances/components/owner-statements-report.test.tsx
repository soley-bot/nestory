// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerStatementsReport, StatementTables } from "./owner-statements-report";
import { FinancialWriteProvider } from "@/lib/finance/financial-write-provider";
import type { OwnerBalanceData } from "../owner-balance.types";
const read = vi.hoisted(() => vi.fn());
const financialSession = vi.hoisted(() => vi.fn((): { context: { generation: number; status: string }; invalid: boolean } | null => null));
vi.mock("@/lib/finance/financial-write-provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/finance/financial-write-provider")>(),
  useFinancialWriteContext: financialSession,
}));
vi.mock("../statement-report-action", () => ({ readStatementReports: read }));
vi.mock("@/features/reports/components/report-remediation-controls", () => ({RecheckReport:()=> <button>Recheck</button>}));
afterEach(()=>{cleanup();vi.resetAllMocks();vi.restoreAllMocks();financialSession.mockReturnValue(null);});
const statement = { unitLabels:{1:"Unit 101"}, published:true, statementNumber:"OS-202609-123456789ABC",stale:false,artifacts:[{id:"pdf-one",format:"pdf" as const}],cash:{openingCents:10000,closingCents:12500,cashInCents:5000,cashOutCents:2500,depositCents:0,transactions:[{lineNumber:1,date:"2026-09-02",type:"Rent received",details:"September rent",cashInCents:5000,cashOutCents:0,balanceCents:15000},{lineNumber:2,date:"2026-09-03",type:"Property expense paid",details:"Repair",cashInCents:0,cashOutCents:2500,balanceCents:12500}]}};
const data = {accountTotal:1,accountPage:1,accountPageCount:1,accountPageSize:12,accounts:[{ownerPersonId:"owner",propertyId:"property",ownerLabel:"Owner One",propertyLabel:"Property One"}],ownerOptions:[{id:"owner",label:"Owner One",propertyIds:["property"]}],propertyOptions:[{id:"property",label:"Property One"}],periods:[],sources:[],queue:[],withdrawalCapacity:null} as unknown as OwnerBalanceData;
describe("owner statement report",()=>{
  it("captures the original generation during a focus check and hides totals and files after invalidation", async () => {
    financialSession.mockReturnValue({ context: { generation: 4, status: "open" }, invalid: false });
    const context = { generation: 4, status: "open" as const, financial_start_date: "2026-09-01", enforced: true };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ organizationId: "org", context }) } as Response);
    read.mockImplementation(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement, failed: false })));
    const user = userEvent.setup();
    const report = () => <FinancialWriteProvider organizationId="org" context={context}><OwnerStatementsReport data={data} month="2026-09" /></FinancialWriteProvider>;
    const { rerender } = render(report());
    await user.click(screen.getByRole("button", { name: /Property One \| Owner One/ }));
    expect((await screen.findByRole("link", { name: "PDF" })).getAttribute("href")).toBe("/api/reports/pdf?artifactId=pdf-one&financialGeneration=4");
    fireEvent.focus(window);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(read.mock.calls[1][0][0].expectedGeneration).toBe(4);
    financialSession.mockReturnValue({ context: { generation: 4, status: "open" }, invalid: true });
    rerender(report());
    expect(screen.getByRole("alert").textContent).toContain("Reload the page");
    expect(screen.queryByRole("link", { name: "PDF" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Statement summary" })).toBeNull();
    fireEvent.focus(window);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("blocks a replacement generation even if the provider has not marked it invalid", () => {
    financialSession.mockReturnValue({ context: { generation: 4, status: "open" }, invalid: false });
    const { rerender } = render(<OwnerStatementsReport data={data} month="2026-09" initialStatements={{ "owner:property": statement }} />);
    financialSession.mockReturnValue({ context: { generation: 5, status: "open" }, invalid: false });
    rerender(<OwnerStatementsReport data={data} month="2026-09" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });
  it("does not invent an owner account for an unmatched exact scope",()=>{
    render(<OwnerStatementsReport data={{...data,accountTotal:0,accounts:[]}} month="2026-09" selectedOwnerPersonId="owner" selectedPropertyId="property"/>);
    expect(screen.getByText("No owner accounts match these filters.")).toBeTruthy();
    expect(screen.queryByRole("button",{name:/Property One \| Owner One/})).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("identifies missing frozen unit attribution without implying a property-level transaction",()=>{
    render(<StatementTables statement={{...statement,unitLabels:undefined}} property="Property One" month="2026-09" view="detail"/>);
    expect(screen.getAllByText("Not recorded")).toHaveLength(2);
  });
  it("loads all visible accounts in a single request and retains report type in navigation",async()=>{
    read.mockImplementation(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement, failed: false })));
    const user = userEvent.setup();
    render(<OwnerStatementsReport data={{...data,accountTotal:2,accountPageCount:2,accounts:[...data.accounts,{...data.accounts[0],ownerPersonId:"second",ownerLabel:"Owner Two"}]}} month="2026-09" reportType="detail"/>);
    await user.click(screen.getByRole("button",{name:"Expand all"}));
    expect(await screen.findAllByRole("region",{name:"Transaction detail"})).toHaveLength(2);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toHaveLength(2);
    expect(screen.queryByRole("region",{name:"Statement summary"})).toBeNull();
    expect(screen.getByRole("link",{name:"Next"}).getAttribute("href")).toContain("reportType=detail");
    expect(document.querySelector('input[name="reportType"]')?.getAttribute("value")).toBe("detail");
  });
  it("loads only on expansion and keeps the retained export tied to its statement",async()=>{
    read.mockImplementation(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement, failed: false }))); const user=userEvent.setup();render(<OwnerStatementsReport data={data} month="2026-09"/>);
    expect(read).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button",{name:/Property One \| Owner One/}));
    expect(await screen.findByRole("region",{name:"Statement summary"})).toBeTruthy();
    expect(screen.getByText("Unit 101")).toBeTruthy();
    expect(screen.getByRole("link",{name:"PDF"}).getAttribute("href")).toBe("/api/reports/pdf?artifactId=pdf-one");
    expect(within(screen.getByRole("region",{name:"Transaction detail"})).getAllByText("$125.00")).toHaveLength(2);
    await user.click(screen.getByRole("button",{name:"Collapse all"}));
    expect(screen.queryByRole("region",{name:"Transaction detail"})).toBeNull();
  });
  it("shows only the requested report section",()=>{
    const {rerender}=render(<StatementTables statement={statement} property="Property One" month="2026-09" view="summary"/>);
    expect(screen.queryByRole("region",{name:"Transaction detail"})).toBeNull();
    rerender(<StatementTables statement={statement} property="Property One" month="2026-09" view="detail"/>);
    expect(screen.queryByRole("region",{name:"Statement summary"})).toBeNull();
    expect(screen.getByText("Ending balance as of 30 Sep 2026")).toBeTruthy();
  });
  it.each([null, statement])("refetches a cached result after refreshed server props", async cached => {
    read.mockImplementationOnce(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement: cached, failed: false })));
    const updated = { ...statement, statementNumber: "Updated statement", artifacts: [{ id: "pdf-new", format: "pdf" }] };
    let complete: (() => void) | undefined;
    read.mockImplementationOnce((scopes: unknown[]) => new Promise(resolve => { complete = () => resolve(scopes.map(scope => ({ scope, statement: updated, failed: false }))); }));
    const user = userEvent.setup();
    const { rerender } = render(<OwnerStatementsReport data={data} month="2026-09" />);
    await user.click(screen.getByRole("button", { name: /Property One \| Owner One/ }));
    if (cached) await screen.findByRole("link", { name: "PDF" });
    else await screen.findByText(/No statement is ready/);
    rerender(<OwnerStatementsReport data={{ ...data }} month="2026-09" />);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link", { name: "PDF" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Statement summary" })).toBeNull();
    await act(async () => complete!());
    expect(await screen.findByText(/Updated statement/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "PDF" }).getAttribute("href")).toContain("pdf-new");
  });
  it("rechecks on focus and visibility restoration, preserving historical publication meaning", async () => {
    read.mockImplementation(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement, failed: false })));
    const user = userEvent.setup();
    render(<OwnerStatementsReport data={data} month="2026-09" />);
    await user.click(screen.getByRole("button", { name: /Property One \| Owner One/ }));
    await screen.findByRole("link", { name: "PDF" });
    read.mockImplementation(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement: { ...statement, stale: true }, failed: false })));
    fireEvent.focus(window);
    expect(await screen.findByText(/saved files show an earlier account state/)).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "PDF" }).getAttribute("href")).toContain("pdf-one");
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    fireEvent.focus(window);
    expect(read).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  });
  it("discards a delayed result from before invalidation, including its old export", async () => {
    let completeOld: (() => void) | undefined;
    read.mockImplementationOnce((scopes: unknown[]) => new Promise(resolve => { completeOld = () => resolve(scopes.map(scope => ({ scope, statement, failed: false }))); }));
    read.mockImplementationOnce(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement: null, failed: false })));
    const user = userEvent.setup();
    const { rerender } = render(<OwnerStatementsReport data={data} month="2026-09" invalidationKey="before" />);
    await user.click(screen.getByRole("button", { name: /Property One \| Owner One/ }));
    expect(read).toHaveBeenCalledTimes(1);
    rerender(<OwnerStatementsReport data={data} month="2026-09" invalidationKey="after" />);
    await screen.findByText(/No statement is ready/);
    await act(async () => completeOld!());
    expect(screen.getByText(/No statement is ready/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "PDF" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Statement summary" })).toBeNull();
  });
  it("does not redisplay old totals if the freshness check fails and lets the user retry", async () => {
    read.mockImplementationOnce(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement, failed: false })));
    read.mockRejectedValueOnce(new Error("Source changed"));
    read.mockImplementationOnce(async (scopes: unknown[]) => scopes.map(scope => ({ scope, statement: null, failed: false })));
    const user = userEvent.setup();
    render(<OwnerStatementsReport data={data} month="2026-09" />);
    await user.click(screen.getByRole("button", { name: /Property One \| Owner One/ }));
    await screen.findByRole("link", { name: "PDF" });
    fireEvent.focus(window);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "PDF" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/No statement is ready/)).toBeTruthy();
  });
  it("keeps the replacement request loading when the abandoned request fails", async () => {
    let rejectOld: ((error: Error) => void) | undefined;
    let completeNew: (() => void) | undefined;
    read.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    read.mockImplementationOnce((scopes: unknown[]) => new Promise(resolve => { completeNew = () => resolve(scopes.map(scope => ({ scope, statement, failed: false }))); }));
    const user = userEvent.setup();
    const { rerender } = render(<OwnerStatementsReport data={data} month="2026-09" invalidationKey="before" />);
    await user.click(screen.getByRole("button", { name: /Property One \| Owner One/ }));
    rerender(<OwnerStatementsReport data={data} month="2026-09" invalidationKey="after" />);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await act(async () => rejectOld!(new Error("Old request failed")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Loading statement…")).toBeTruthy();
    await act(async () => completeNew!());
    expect(await screen.findByRole("link", { name: "PDF" })).toBeTruthy();
  });
});
