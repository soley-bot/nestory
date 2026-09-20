import { describe, expect, it } from "vitest";
import { filterTransactions, projectTransactions, transactionReportLinks } from "./transaction-workspace";
import type { ExpenseSubmissionSummary, FinanceLease, FinanceOperationsData, PropertyAccountEntry, TenantInvoiceSummary } from "../finance-operations.types";

export const invoice = (overrides: Partial<TenantInvoiceSummary> = {}): TenantInvoiceSummary => ({
  id: "invoice-a", invoiceNumber: "RENT-001", propertyId: "property-a", propertyLabel: "A", unitId: "unit-a", unitLabel: "101", recipientLabel: "Tenant A", issueDate: "2026-09-01", billingPeriodStart: "2026-09-01", dueDate: "2026-09-05", balanceDue: 300, totalAmount: 500, collectedByOwner: 0, paidThroughIps: 200, collectionRoute: "through_ips", generationSource: "scheduled", isProrated: false, leaseId: "lease-a", lines: [], occupantLabels: [], paymentStatus: "partly_paid", pdf: {artifactId: null, href: null, publicationStatus: "not_published", publishedAt: null}, publicationSnapshot: null,
  settlements: [{id: "payment-a", amount: 200, date: "2026-09-04", isReversed: false, reference: "Bank transfer", reversalReason: null, receipt: null, receiptNumber: "REC-001", route: "through_ips"}], ...overrides,
});
const input = (overrides: Partial<FinanceOperationsData> = {}) => ({ tenantInvoices: [invoice()], expenseSubmissions: [], accountEntries: [], ...overrides });
describe("transaction workspace projection", () => {
  it("keeps partial charges separate from cash and does not duplicate account allocations", () => {
    const rows = projectTransactions(input({ accountEntries: [{id: "allocation", amount: 200, date: "2026-09-04", createdAt: "", category: "rent", label: "Receipt", propertyId: "property-a", runningBalance: 200, note: null, sourceType: "tenant_invoice_payment"}] }));
    expect(rows.map(row => [row.kind, row.amount])).toEqual([["payment",200],["charge",500]]);
    expect(rows[0].source).toMatchObject({kind: "payment", settlement: {id: "payment-a"}, invoice: {id: "invoice-a"}});
  });
  it("excludes reversed originals by default and retains them in history", () => {
    const rows = projectTransactions(input({ tenantInvoices: [invoice({paymentStatus: "voided", settlements: [{...invoice().settlements[0], isReversed: true}]})], accountEntries: [{ id: "withdrawal-a", amount: 400, date: "2026-09-02", createdAt: "", category: "", label: "Distribution", propertyId: "property-a", runningBalance: 0, note: null, sourceType: "property_withdrawal", source: {kind: "distribution", id: "withdrawal-a", reference: null, isReversed: true} }] }));
    expect(filterTransactions(rows, {propertyId: "property-a"})).toHaveLength(0);
    expect(filterTransactions(rows, {propertyId: "property-a", includeHistory: true})).toHaveLength(3);
  });
  it("applies exact property/unit, period, tenant, type, status and search filters", () => {
    const rows = projectTransactions(input({tenantInvoices: [invoice(), invoice({id:"other-unit", unitId:"unit-b"}), invoice({id:"other-property", propertyId:"property-b"})]}));
    expect(filterTransactions(rows,{propertyId:"property-a",unitId:"unit-a",month:"2026-09",kind:"payment",status:"received",tenant:"Tenant A",query:"rec-001"}).map(row => row.sourceId)).toEqual(["payment-a"]);
    expect(filterTransactions(rows,{propertyId:"property-a",month:"2026-08"})).toEqual([]);
  });
  it("never assigns property owner cash or property costs to a unit", () => {
    const rows = projectTransactions(input({accountEntries: [{id:"cash", amount: 100, date:"2026-09-02", createdAt:"", category:"", label:"Contribution", propertyId:"property-a", runningBalance:100, note:null,sourceType:"owner_contribution"}]}));
    expect(filterTransactions(rows,{propertyId:"property-a",unitId:"unit-a"}).map(row => row.kind)).toEqual(["payment","charge"]);
  });
  it("filters mixed-unit expense lines once and disables mutation of the partial transaction", () => {
    const submission = {id:"expense-a", transactionId:"transaction-a", date:"2026-09-01", propertyId:"property-a", unitId:null, unitLabel:"Multiple units", internalCost:90, category:"repair", vendorLabel:"Vendor", status:"approved", lines:[
      {propertyId:"property-a",unitId:"unit-a",unitLabel:"101",amount:30},
      {propertyId:"property-a",unitId:"unit-b",unitLabel:"102",amount:60},
    ]} as ExpenseSubmissionSummary;
    const rows = filterTransactions(projectTransactions(input({expenseSubmissions:[submission]})),{propertyId:"property-a",unitId:"unit-a",kind:"expense"});
    expect(rows).toHaveLength(1);expect(rows[0].amount).toBe(30);
    expect(rows[0].source).toMatchObject({submission:{transactionReviewBlocked:true,scopedSubtotal:30}});
  });
  it("includes fees in their lease unit and keeps unmatched account costs visible without duplicating source documents", () => {
    const base = {amount:40,date:"2026-09-01",createdAt:"",category:"fee",label:"Management fee",propertyId:"property-a",runningBalance:0,note:null};
    const entries: PropertyAccountEntry[] = [
      {...base,id:"fee-a",sourceType:"management_fee_occurrence",source:{kind:"lease",id:"lease-a",reference:null}},
      {...base,id:"fee-old",sourceType:"management_fee_occurrence",source:{kind:"lease",id:"lease-a",reference:null,isReversed:true}},
      {...base,id:"cost-a",sourceType:"ips_expense_responsibility",source:{kind:"expense",id:"missing-cost",reference:null}},
      {...base,id:"allocation",sourceType:"tenant_invoice_payment",source:{kind:"rent",id:"invoice-a",reference:null}},
    ];
    const rows=projectTransactions({...input({accountEntries:entries}),leases:[{id:"lease-a",unitId:"unit-a",unitLabel:"101",tenantLabel:"Tenant A"} as FinanceLease]});
    const unitRows=filterTransactions(rows,{propertyId:"property-a",unitId:"unit-a"});
    expect(unitRows.filter(row=>row.kind==="management_fee")).toHaveLength(1);
    expect(filterTransactions(rows,{propertyId:"property-a"}).filter(row=>row.kind==="account").map(row=>row.sourceId)).toEqual(["missing-cost"]);
    expect(unitRows.filter(row=>row.kind==="payment")).toHaveLength(1);
  });
  it("uses identical period and scope for P&L screen and exports and explicit property statement authority", () => {
    const links = transactionReportLinks({propertyId:"property-a",unitId:"unit-a"},"2026-08","owner-a");
    for (const href of [links.profitLoss,links.pdf,links.excel]) {
      const params = new URL(href,"https://example.com").searchParams;
      expect(params.get("month")).toBe("2026-08");expect(params.get("propertyId")).toBe("property-a");expect(params.get("unitId")).toBe("unit-a");
    }
    expect(links.ownerStatement).toBe("/balances?month=2026-08&propertyId=property-a&view=statements&ownerPersonId=owner-a");
  });
});
