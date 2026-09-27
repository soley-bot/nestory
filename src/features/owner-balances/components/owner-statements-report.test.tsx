// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerStatementsReport, StatementTables } from "./owner-statements-report";
import type { OwnerBalanceData } from "../owner-balance.types";
const read = vi.hoisted(() => vi.fn());
vi.mock("../statement-report-action", () => ({ readStatementReports: read }));
vi.mock("@/features/reports/components/report-remediation-controls", () => ({RecheckReport:()=> <button>Recheck</button>}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const statement = { unitLabels:{1:"Unit 101"}, published:true, statementNumber:"OS-202609-123456789ABC",stale:false,artifacts:[{id:"pdf-one",format:"pdf" as const}],cash:{openingCents:10000,closingCents:12500,cashInCents:5000,cashOutCents:2500,depositCents:0,transactions:[{lineNumber:1,date:"2026-09-02",type:"Rent received",details:"September rent",cashInCents:5000,cashOutCents:0,balanceCents:15000},{lineNumber:2,date:"2026-09-03",type:"Property expense paid",details:"Repair",cashInCents:0,cashOutCents:2500,balanceCents:12500}]}};
const data = {accountTotal:1,accountPage:1,accountPageCount:1,accountPageSize:12,accounts:[{ownerPersonId:"owner",propertyId:"property",ownerLabel:"Owner One",propertyLabel:"Property One"}],ownerOptions:[{id:"owner",label:"Owner One",propertyIds:["property"]}],propertyOptions:[{id:"property",label:"Property One"}],periods:[],sources:[],queue:[],withdrawalCapacity:null} as unknown as OwnerBalanceData;
describe("owner statement report",()=>{
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
});
