/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/reports/remediation-actions", () => ({
  closeReportMonthAction: vi.fn(), reopenReportMonthAction: vi.fn(), correctReportMonthAction: vi.fn(), publishReportStatementAction: vi.fn(), resumeReportStatementAction: vi.fn(), calculateReportMonthAction: vi.fn(), assignReportSourceAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

vi.mock("@/features/owner-balances/lifecycle-actions", () => ({
  allocateOwnerEventAction: vi.fn(),
  generateOwnerBalancePeriodAction: vi.fn(),
  recordOwnerCashEventAction: vi.fn(),
  recordOwnerDistributionAction: vi.fn(),
  reverseOwnerInvoicePaymentAction: vi.fn(),
  reversePropertyWithdrawalAction: vi.fn(),
  transferOwnerBalanceComponentAction: vi.fn(),
}));

import { calculateReportMonthAction, assignReportSourceAction } from "@/features/reports/remediation-actions";
import { OwnerBalanceLedger } from "@/features/owner-balances/components/owner-balance-ledger";
import type { OwnerBalanceData } from "@/features/owner-balances/owner-balance.types";

const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const sourceId = "00000000-0000-4000-8000-000000000004";
const sourceLineId = "00000000-0000-4000-8000-000000000005";
const allocationSetId = "00000000-0000-4000-8000-000000000006";
const movementId = "00000000-0000-4000-8000-000000000007";

describe("OwnerBalanceLedger", () => {
  it.each(["success", "error"])("resets inline calculation state when month changes after %s", async (status) => {
    const user = userEvent.setup();
    vi.mocked(calculateReportMonthAction).mockResolvedValueOnce(status === "success" ? { status: "success" } : { status: "error", message: "Earlier month needs review." });
    const props = { canAllocate: false, canGenerate: true, canCorrect: false, canTransfer: false, data: { ...data(), periods: [] }, organizationName: "IPS", selectedOwnerPersonId: ownerId, selectedPropertyId: propertyId };
    const { rerender } = render(<OwnerBalanceLedger {...props} selectedMonth="2026-08" />);
    await user.click(screen.getByRole("button", { name: "Generate month" }));
    await screen.findByText(status === "success" ? /Saved/ : "Earlier month needs review.");
    rerender(<OwnerBalanceLedger {...props} selectedMonth="2026-09" />);
    const button = screen.getByRole("button", { name: "Generate month" });
    expect((button.closest("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
    expect(new FormData(button.closest("form")!).get("monthStart")).toBe("2026-09-01");
    expect(screen.queryByText("Earlier month needs review.")).toBeNull();
    expect(screen.queryByText(/Saved/)).toBeNull();
  });

  it("keeps a checked re-evaluation action for a blocked source after its prerequisite changes", async () => {
    const user = userEvent.setup();
    const input = data(); input.queue[0] = { ...input.queue[0], remediationCode: "source_fingerprint_drift", remediationDetail: null };
    vi.mocked(assignReportSourceAction).mockResolvedValueOnce({ status: "success" });
    render(<OwnerBalanceLedger canAllocate canCorrect={false} canTransfer={false} data={input} organizationName="IPS" selectedMonth="2026-08" selectedPropertyId={propertyId} selectedOwnerPersonId={ownerId} />);
    await user.click(screen.getByRole("button", { name: "Recheck and assign source" }));
    expect(vi.mocked(assignReportSourceAction).mock.calls.at(-1)?.[0].get("sourceLineId")).toBe(sourceLineId);
    await screen.findByText(/Saved/);
  });

  it.each([false, true])("gates ownership repair in both register and issue rows by delegated authority (%s)", (canResolveOwnership) => {
    const input = data();
    input.accounts = [{
      availableAmount: null, issueCodes: ["owner_roster_missing"], issueCount: 1,
      lastActivityDate: "2026-08-28", lastActivityDetail: "sources=1",
      ownerLabel: "Nora Owner", ownerPersonId: ownerId, periodStatus: "blocked",
      propertyId, propertyLabel: "Riverside", remediationPath: `/properties/${propertyId}`,
      withdrawalStatus: "blocked",
    }];
    input.accountTotal = 1;
    const props = { canAllocate: false, canCorrect: false, canTransfer: false,
      canResolveOwnership, data: input, organizationName: "IPS", selectedMonth: "2026-08" };
    const { container, rerender } = render(<OwnerBalanceLedger {...props} />);
    expect(screen.getByText("Action required")).toBeTruthy();
    if (canResolveOwnership) {
      expect(screen.getByRole("link", { name: "Resolve ownership" }).getAttribute("href")).toContain(`/properties/${propertyId}?returnTo=`);
    } else {
      expect(screen.getByRole("link", { name: "Review issues" }).getAttribute("href")).toContain("/balances?");
      expect(container.querySelector('a[href^="/properties"]')).toBeNull();
    }
    rerender(<OwnerBalanceLedger {...props} selectedOwnerPersonId={ownerId} selectedPropertyId={propertyId} />);
    const issue = screen.getByTestId(`owner-remediation-${sourceLineId}`);
    expect(within(issue).getByText("Ownership needs resolution")).toBeTruthy();
    expect(within(issue).queryByRole("link", { name: "Resolve ownership" }) !== null).toBe(canResolveOwnership);
    expect(within(issue).queryByRole("button")).toBeNull();
  });

  it("updates displayed filters when route navigation selects an exact statement account", () => {
    const props = {
      canAllocate: false, canCorrect: false, canTransfer: false,
      data: data(), organizationName: "IPS", selectedMonth: "2026-08",
      selectedView: "statements" as const,
    };
    const { container, rerender } = render(<OwnerBalanceLedger {...props} />);
    rerender(<OwnerBalanceLedger {...props} selectedMonth="2026-09"
      selectedOwnerPersonId={ownerId} selectedPropertyId={propertyId} />);

    const form = container.querySelector('input[name="view"]')!.closest("form")!;
    const scope = new FormData(form);
    expect(scope.get("ownerPersonId")).toBe(ownerId);
    expect(scope.get("propertyId")).toBe(propertyId);
    expect(scope.get("month")).toBe("2026-09");
    expect(scope.get("view")).toBe("statements");
  });

  it("unmounts a summary operation dialog when navigation switches to statements", async () => {
    const user = userEvent.setup();
    const props = {
      canAllocate: false, canCorrect: false, canTransfer: false,
      closingAuthority: <section aria-label="Saved statements">Saved PDF and Excel</section>,
      data: data(), organizationName: "IPS", selectedMonth: "2026-08",
      selectedOwnerPersonId: ownerId, selectedPropertyId: propertyId,
    };
    const { rerender } = render(<OwnerBalanceLedger {...props} selectedView="summary" />);
    await user.click(screen.getByRole("button", { name: "Account actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Close month" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    rerender(<OwnerBalanceLedger {...props} selectedView="statements" />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("region", { name: "Saved statements" })).toHaveLength(1);
  });

  it("opens statements directly and carries the selected scope through every view", () => {
    const { container } = render(<OwnerBalanceLedger
      canAllocate={false} canCorrect={false} canTransfer={false}
      closingAuthority={<section aria-label="Saved statements">Saved PDF and Excel</section>}
      data={data()} organizationName="IPS" selectedMonth="2026-08"
      selectedOwnerPersonId={ownerId} selectedPropertyId={propertyId} selectedView="statements"
    />);
    expect(screen.getByRole("region", { name: "Saved statements" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Monthly balances" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Account actions" })).toBeNull();
    expect(container.querySelector('input[name="view"]')?.getAttribute("value")).toBe("statements");
    for (const [name, view] of [["Summary", "summary"], ["Activity", "activity"], ["Statements", "statements"]]) {
      const link = within(screen.getByRole("navigation", { name: "Owner account views" })).getByRole("link", { name });
      const url = new URL(link.getAttribute("href")!, "http://localhost");
      expect(Object.fromEntries(url.searchParams)).toEqual({ month: "2026-08", ownerPersonId: ownerId, propertyId, view });
      expect(link.getAttribute("aria-current")).toBe(view === "statements" ? "page" : null);
    }
  });

  it("keeps the statement task when opening a row that has accounting issues", () => {
    const registerData = data();
    registerData.accounts = [{
      availableAmount: null, issueCodes: ["owner_roster_missing"], issueCount: 1,
      lastActivityDate: "2026-08-28", lastActivityDetail: "sources=1",
      ownerLabel: "Nora Owner", ownerPersonId: ownerId, periodStatus: "stale",
      propertyId, propertyLabel: "Riverside", remediationPath: `/properties/${propertyId}`,
      withdrawalStatus: "stale",
    }];
    registerData.accountTotal = 1;
    render(<OwnerBalanceLedger canAllocate={false} canCorrect={false} canTransfer={false}
      data={registerData} organizationName="IPS" selectedMonth="2026-08" selectedView="statements" />);
    expect(screen.getByRole("link", { name: "View statements" }).getAttribute("href"))
      .toContain("view=statements");
    expect(screen.queryByRole("columnheader", { name: "Available" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Resolve ownership" })).toBeNull();
  });

  it("renders exact authoritative components, source lineage, and typed remediation", () => {
    const { container } = render(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect
        canTransfer
        canResolveOwnership
        data={data()}
        openingAuthority={<div>Opening balance queue</div>}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Owner accounts" }),
    ).toBeTruthy();
    const layout = container.querySelector("main");
    expect(layout?.className).toContain("px-4");
    expect(layout?.className).toContain("sm:px-6");
    expect(layout?.className).toContain("2xl:px-8");
    expect(screen.queryByText("Opening balance queue")).toBeNull();
    expect(screen.getByRole("button", { name: "Account actions" })).toBeTruthy();
    const period = screen.getByTestId("owner-period-2026-08-01");
    expect(within(period).getByText("USD 900,719,925,474.09")).toBeTruthy();
    expect(within(period).getByText("USD 0.09")).toBeTruthy();
    expect(within(period).getByText("USD 2.00")).toBeTruthy();
    expect(within(period).queryByText(/Available owner cash/)).toBeNull();
    expect(within(period).queryByText(/Available withdrawal/)).toBeNull();
    expect(within(period).getByText("Input watermark")).toBeTruthy();
    expect(within(period).getByText("2026-08-31T00:00:00Z")).toBeTruthy();

    const capacity = screen.getByTestId("owner-withdrawal-capacity");
    expect(within(capacity).getByText("Available to distribute")).toBeTruthy();
    expect(within(capacity).getByText("USD 900,719,925,374.09")).toBeTruthy();
    expect(within(capacity).getByText(/As of 2026-08-31/)).toBeTruthy();
    expect(
      within(capacity).getByText(/Committed or reserved: USD 100.00/),
    ).toBeTruthy();

    const source = screen.getByTestId(`owner-source-${allocationSetId}`);
    expect(within(source).getByText("Tenant rent receipt")).toBeTruthy();
    expect(
      within(source).getByText(/Ownership at event 100.000%/),
    ).toBeTruthy();
    expect(within(source).getByText("Source fingerprint")).toBeTruthy();
    expect(within(source).getByText("b".repeat(64))).toBeTruthy();
    expect(
      within(source).getByText("Owner funds held by IPS +USD 100.01"),
    ).toBeTruthy();

    expect(within(period).getByText("Calculated")).toBeTruthy();
    expect(within(period).getByText("Owner funds held by IPS")).toBeTruthy();
    expect(within(period).getByText("Owner owes IPS")).toBeTruthy();
    expect(screen.getByText("Items to resolve")).toBeTruthy();
    expect(screen.queryByText("Source issues")).toBeNull();

    const remediation = screen.getByTestId(`owner-remediation-${sourceLineId}`);
    expect(
      within(remediation).getByText("Ownership needs resolution"),
    ).toBeTruthy();
    expect(within(remediation).getByText(/owner_roster_missing/)).toBeTruthy();
    expect(
      within(remediation)
        .getByRole("link", { name: "Resolve ownership" })
        .getAttribute("href"),
    ).toContain(`/properties/${propertyId}?returnTo=`);
  });

  it("shows a scannable register before an owner scope is selected", () => {
    render(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect
        canTransfer
        canResolveOwnership
        data={{
          ...data(),
          accountTotal: 1,
          accounts: [
            {
              availableAmount: "500.00",
              issueCodes: ["owner_roster_missing", "source_fingerprint_drift"],
              issueCount: 2,
              lastActivityDate: "2026-08-28",
              lastActivityDetail: "sources=13",
              ownerLabel: "Nora Owner",
              ownerPersonId: ownerId,
              periodStatus: "stale",
              propertyId,
              propertyLabel: "Riverside — RS-01",
              remediationPath: `/properties/${propertyId}`,
              withdrawalStatus: "stale",
            },
          ],
        } as unknown as OwnerBalanceData}
        organizationName="IPS"
        selectedMonth="2026-08"
      />,
    );

    expect(screen.getByRole("heading", { name: "Owner accounts" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Owner" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Owner" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Apply filters" })).toBeTruthy();

    const register = screen.getByRole("table", { name: "Owner account register" });
    expect(screen.queryByText(/Open an account (for balances|to view its saved statements)/)).toBeNull();
    expect(within(register).getByRole("columnheader", { name: "Owner" })).toBeTruthy();
    expect(within(register).getByRole("columnheader", { name: "Property" })).toBeTruthy();
    expect(within(register).getByRole("columnheader", { name: "Available" })).toBeTruthy();
    expect(within(register).getByRole("columnheader", { name: "Status" })).toBeTruthy();
    expect(within(register).getByRole("columnheader", { name: "Issues" })).toBeTruthy();
    expect(within(register).getByRole("columnheader", { name: "Activity" })).toBeTruthy();
    expect(within(register).getByRole("columnheader", { name: "Next action" })).toBeTruthy();

    const account = within(register)
      .getByRole("rowheader", { name: "Nora Owner" })
      .closest("tr")!;
    expect(within(account).getByText("Action required")).toBeTruthy();
    expect(within(account).getByText("High priority")).toBeTruthy();
    expect(account.children[5]?.textContent).toBe("2026-08-28");
    expect(
      within(account).getByText("sources=13").closest("details"),
    ).not.toBeNull();
    expect(
      within(account).getByRole("link", { name: "Resolve ownership" }).getAttribute("href"),
    ).toContain(`/properties/${propertyId}?returnTo=`);
  });

  it("shows a focused empty result instead of a selector gate", () => {
    render(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect
        canTransfer
        data={{ ...data(), accounts: [] } as unknown as OwnerBalanceData}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedPropertyId={propertyId}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No owner accounts match these filters" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href"))
      .toBe("/balances?month=2026-08");
    expect(screen.queryByText("Choose a property and owner")).toBeNull();
  });

  it("exposes only the checked actions delegated to the current role", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect
        canTransfer={false}
        data={{ ...data(), queue: data().queue.map(item => ({ ...item, allocationState: "pending", remediationDetail: null, remediationCode: null })) }}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Assign to owner balance" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Account actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Calculate month" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Record owner contribution" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Record owner reimbursement" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Record owner distribution" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Transfer balance" }),
    ).toBeNull();

    rerender(
      <OwnerBalanceLedger
        canAllocate={false}
        canCorrect={false}
        canTransfer={false}
        data={data()}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Assign to owner balance" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate month" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Record owner/ })).toBeNull();
  });

  it("keeps account actions fail-closed when no exact scope is selected", () => {
    render(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect
        canTransfer
        data={{ ...data(), periods: [], queue: [], sources: [] }}
        organizationName="IPS"
        selectedMonth="2026-08"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No owner accounts yet" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate month" })).toBeNull();
  });

  it("keeps opening and close workflows in focused dialogs after scope selection", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect
        canTransfer
        closingAuthority={<div>Month close workflow</div>}
        data={{ ...data(), periods: [], queue: [], sources: [] }}
        openingAuthority={<div>Opening balance workflow</div>}
        organizationName="IPS"
        selectedMonth="2026-08"
      />,
    );

    expect(screen.queryByText("Opening balance workflow")).toBeNull();
    expect(screen.queryByText("Month close workflow")).toBeNull();

    rerender(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect
        canTransfer
        closingAuthority={<div>Month close workflow</div>}
        data={data()}
        openingAuthority={<div>Opening balance workflow</div>}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    expect(screen.queryByText("Opening balance workflow")).toBeNull();
    expect(screen.queryByText("Month close workflow")).toBeNull();
    expect(screen.queryByRole("button", { name: "Opening balance" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate month" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Account actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Opening balance" }));
    expect(
      within(screen.getByRole("dialog", { name: "Opening balance" })).getByText(
        "Opening balance workflow",
      ),
    ).toBeTruthy();
  });

  it("opens month calculation from the same account action menu", async () => {
    const user = userEvent.setup();
    render(
      <OwnerBalanceLedger
        canAllocate
        canGenerate
        canCorrect={false}
        canTransfer={false}
        data={data()}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Account actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Calculate month" }));

    const dialog = screen.getByRole("dialog", { name: "Calculate month" });
    expect(within(dialog).getByRole("button", { name: "Generate month" })).toBeTruthy();
  });

  it.each(["blocked", "unavailable", "historical_not_eligible", "period_stale"])(
    "does not present %s closing cash as current withdrawal capacity",
    (status) => {
      const blocked = data();
      blocked.periods[0]!.components[0]!.closingAmount = "975.00" as never;
      blocked.periods[0]!.availableWithdrawal = "975.00" as never;
      blocked.withdrawalCapacity = {
        asOfDate: "2026-07-31",
        authoritativeHeldCash: "500.00",
        availableWithdrawal: null,
        committedReserved: "25.00",
        periodStatus: status === "period_stale" ? "stale" : "ready",
        status,
      } as OwnerBalanceData["withdrawalCapacity"];

      render(
        <OwnerBalanceLedger
          canAllocate
        canGenerate
          canCorrect
          canTransfer={false}
          data={blocked}
          organizationName="IPS"
          selectedMonth="2026-07"
          selectedOwnerPersonId={ownerId}
          selectedPropertyId={propertyId}
        />,
      );

      const capacity = screen.getByTestId("owner-withdrawal-capacity");
      expect(
        within(capacity).getByText("Distribution amount unavailable"),
      ).toBeTruthy();
      expect(within(capacity).queryByText("USD 500.00")).toBeNull();
      const period = screen.getByTestId("owner-period-2026-08-01");
      expect(within(period).getByText("Calculated")).toBeTruthy();
      expect(within(period).getByText("USD 975.00")).toBeTruthy();
      expect(within(period).queryByText(/Available owner cash/)).toBeNull();
      expect(screen.queryByText("Ready to distribute")).toBeNull();
    },
  );

  it.each(["blocked", "unavailable", "available"])("register distribution wording follows %s capacity, not a calculated month alone", (withdrawalStatus) => {
    const input = data();
    input.accounts = [{
      availableAmount: withdrawalStatus === "available" ? "975.00" : null,
      issueCodes: [], issueCount: 0, lastActivityDate: "2026-08-31", lastActivityDetail: null,
      ownerLabel: "Nora Owner", ownerPersonId: ownerId, periodStatus: "ready",
      propertyId, propertyLabel: "Riverside", remediationPath: null, withdrawalStatus,
    }] as OwnerBalanceData["accounts"];
    input.accountTotal = 1;
    render(<OwnerBalanceLedger canAllocate={false} canCorrect={false} canTransfer={false}
      data={input} organizationName="IPS" selectedMonth="2026-08" />);
    if (withdrawalStatus === "available") {
      expect(screen.getByText("Ready to distribute")).toBeTruthy();
    } else {
      expect(screen.queryByText("Ready to distribute")).toBeNull();
      expect(screen.getByText("Distribution unavailable")).toBeTruthy();
    }
  });
});

function data(): OwnerBalanceData {
  return {
    accountPage: 1,
    accountPageCount: 1,
    accountPageSize: 12,
    accountTotal: 0,
    accounts: [],
    ownerOptions: [
      { id: ownerId, label: "Nora Owner", propertyIds: [propertyId] },
    ],
    periods: [
      {
        availableWithdrawal: "900719925474.09" as never,
        blockedReasonCode: null,
        blockedReasonDetail: null,
        components: [
          {
            closingAmount: "900719925474.09" as never,
            component: "ips_held_owner_cash",
            movementAmount: "0.09" as never,
            openingAmount: "900719925474.00" as never,
          },
          {
            closingAmount: "2.00" as never,
            component: "owner_due_to_ips",
            movementAmount: "-3.00" as never,
            openingAmount: "5.00" as never,
          },
          {
            closingAmount: "4.00" as never,
            component: "ips_due_to_owner",
            movementAmount: "4.00" as never,
            openingAmount: "0.00" as never,
          },
          {
            closingAmount: "50.00" as never,
            component: "security_deposit_custody",
            movementAmount: "50.00" as never,
            openingAmount: "0.00" as never,
          },
        ],
        id: "00000000-0000-4000-8000-000000000009",
        inputHash: "a".repeat(64),
        inputWatermark: "2026-08-31T00:00:00Z",
        monthStart: "2026-08-01",
        status: "ready",
      },
    ],
    propertyOptions: [{ id: propertyId, label: "RS-01 — Riverside" }],
    queue: [
      {
        allocationSetId: null,
        allocationState: "blocked",
        eventDate: "2026-08-15",
        grossSignedAmount: "-100.01" as never,
        remediationCode: "owner_roster_missing",
        remediationDetail: { setup_path: `/properties/${propertyId}` },
        sourceId,
        sourceLineId,
        sourceType: "owner_paid_cost",
      },
    ],
    sources: [
      {
        allocatedGrossSignedAmount: "100.01" as never,
        allocationBasis: "effective_roster",
        allocationSetId,
        eventDate: "2026-08-10",
        grossSignedAmount: "100.01" as never,
        movements: [
          {
            component: "ips_held_owner_cash",
            id: movementId,
            reversalOfMovementId: null,
            signedAmount: "100.01" as never,
          },
        ],
        ownershipPercentSnapshot: "100.000",
        ownershipRosterHash: "c".repeat(64),
        reversalOfAllocationSetId: null,
        sourceFingerprint: "b".repeat(64),
        sourceId,
        sourceLineId,
        sourceType: "tenant_rent_receipt",
      },
    ],
    withdrawalCapacity: {
      asOfDate: "2026-08-31",
      authoritativeHeldCash: "900719925474.09" as never,
      availableWithdrawal: "900719925374.09" as never,
      committedReserved: "100.00" as never,
      periodStatus: "ready",
      status: "available",
    },
  } as unknown as OwnerBalanceData;
}
