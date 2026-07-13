/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { PropertyFinanceWorkspace, rankFinanceRows } from "@/features/overview/components/property-finance-workspace";
import type {
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

afterEach(cleanup);

describe("OverviewScreen", () => {
  it.each([
    ["leasing", "Leasing priorities", "Vacancy and lease gaps", "Lease expiries"],
    ["maintenance", "Maintenance priorities", "Open work", "Paid maintenance cost"],
    ["records", "Records priorities", "Statement blockers", "Missing owner links"],
  ] as const)("renders the %s lens with the shared operating grammar", (lens, queue, first, second) => {
    render(
      <OverviewScreen
        data={operatingWorkspaceData}
        query={{ ...portfolioQuery, lens }}
      />,
    );

    expect(screen.getByRole("link", { name: "Portfolio" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Property finance" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: queue })).toBeTruthy();
    expect(screen.getAllByText(first).length).toBeGreaterThan(0);
    expect(screen.getAllByText(second).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Attention and readiness" })).toBeTruthy();
    expect(screen.queryByText("Company P&L")).toBeNull();
    expect(screen.queryByText("Company costs")).toBeNull();
    expect(screen.queryByText("Journal health")).toBeNull();
  });

  it("uses exact lens counts and preserves supported destination state", () => {
    const query = { ...selectedPortfolioQuery, lens: "maintenance" as const };
    render(<OverviewScreen data={operatingWorkspaceData} query={query} />);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Paid maintenance cost/ }).getAttribute("href")).toBe("/bills-expenses?expenseType=maintenance&status=paid&dateBasis=paid&month=2026-07&propertyId=prop-1");
    expect(screen.getByRole("link", { name: /Maintenance expenses/ }).getAttribute("href")).toBe("/bills-expenses?expenseType=maintenance&month=2026-07&propertyId=prop-1");
    expect(screen.getAllByText("Not calculated").length).toBeGreaterThan(0);
  });

  it("uses the actual 60-day lease risk count and keeps mobile queue facts equivalent", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...selectedPortfolioQuery, lens: "leasing" }} />);
    const expiry = screen.getByRole("link", { name: /Lease expiries/ });
    expect(expiry.textContent).toContain("2");
    expect(expiry.getAttribute("href")).toContain("propertyId=prop-1");
    const cards = screen.getByLabelText("Leasing priority cards");
    expect(cards.textContent).toContain("Central Residence");
    expect(cards.textContent).toContain("90%");
    expect(within(cards).getByRole("link", { name: /Central Residence/ }).getAttribute("href")).toBe("/properties/prop-1");
    expect(screen.getByRole("link", { name: /Active leases/ }).getAttribute("href")).toBe("/leases?status=current&propertyId=prop-1");
    expect(screen.getByRole("link", { name: /Properties ranked/ }).getAttribute("href")).toBe("/overview?lens=leasing&month=2026-07&propertyId=prop-1");
  });

  it("keeps records blockers separate and preserves internal review state", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...selectedPortfolioQuery, lens: "records" }} />);
    expect(screen.getAllByRole("link", { name: /Statement blockers/ })[0].getAttribute("href")).toBe("/overview?lens=records&month=2026-07&propertyId=prop-1&review=statement-blocked");
    expect(screen.getAllByText("Not calculated").length).toBeGreaterThan(0);
  });

  it("opens the parser-backed management fee family with month and property state", () => {
    render(<PropertyFinanceWorkspace data={operatingWorkspaceData} query={{ ...selectedPortfolioQuery, lens: "finance", financeView: "management-fees" }} />);
    expect(screen.getAllByRole("link", { name: /Satomi/ })[0].getAttribute("href")).toBe("/rent-income?incomeScope=management-fees&month=2026-07&propertyId=prop-1");
  });

  it("ranks finance rows according to each subview", () => {
    const second = { ...operatingWorkspaceData.propertyPerformance.rows[0], propertyId: "prop-2", label: "Alpha", arrearsAmount: 500, collectionRate: 60, cashExpensesAmount: 10, managementFeeOutstandingAmount: 200, statementBlockers: 3, cashIncomeAmount: 100 };
    const rows = [operatingWorkspaceData.propertyPerformance.rows[0], second];
    expect(rankFinanceRows(rows, "collections")[0].propertyId).toBe("prop-2");
    expect(rankFinanceRows(rows, "expenses")[0].propertyId).toBe("prop-1");
    expect(rankFinanceRows(rows, "management-fees")[0].propertyId).toBe("prop-2");
    expect(rankFinanceRows(rows, "owner-statements")[0].propertyId).toBe("prop-2");
    expect(rankFinanceRows(rows, "transactions")[0].propertyId).toBe("prop-1");
  });

  it("uses label then property id for stable finance ranking ties", () => {
    const base = operatingWorkspaceData.propertyPerformance.rows[0];
    const rows = [{ ...base, label: "Zulu", propertyId: "prop-z" }, { ...base, label: "Alpha", propertyId: "prop-b" }, { ...base, label: "Alpha", propertyId: "prop-a" }];
    expect(rankFinanceRows(rows, "expenses").map((row) => row.propertyId)).toEqual(["prop-a", "prop-b", "prop-z"]);
  });

  it("shows a setup path instead of a clear dashboard for a new workspace", () => {
    render(<OverviewScreen data={emptyWorkspaceData} />);

    expect(
      screen.getByRole("heading", {
        name: "Start with your operating records.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Setup plan")).toBeTruthy();
    expect(screen.queryByText("Fastest start")).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: /add first property/i })
        .every(
          (link) => link.getAttribute("href") === "/properties?action=create",
        ),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: /open imports/i })
        .every((link) => link.getAttribute("href") === "/import"),
    ).toBe(true);
    expect(screen.getByText("Import center")).toBeTruthy();
    expect(screen.getByText("500 valid rows per commit")).toBeTruthy();
    expect(screen.queryByText(/not people or leases/i)).toBeNull();
  });

  it("shows every URL-backed operating lens without company accounting copy", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...portfolioQuery, lens: "finance" }} />);
    expect(screen.getByRole("link", { name: "Property finance" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Maintenance" }).getAttribute("href")).toContain("lens=maintenance");
    expect(screen.queryByText("Company P&L")).toBeNull();
  });

  it("shows a cash-basis property scorecard with URL-backed selection", () => {
    render(
      <OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />,
    );

    expect(
      screen.getByRole("heading", { name: "Property performance" }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /Satomi Dimitroff-Guorguieff/ })
        .some(
          (link) =>
            link.getAttribute("href") ===
            "/overview?month=2026-07&propertyId=prop-1",
        ),
    ).toBe(true);
    expect(screen.getAllByText("USD 827.40").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash basis")).toBeTruthy();
    expect(screen.queryByText("Company P&L")).toBeNull();
  });

  it("exposes scorecard facts in labeled mobile card markup", () => {
    render(
      <OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />,
    );

    const mobileCards = screen.getByRole("region", {
      name: "Property performance cards",
    });
    expect(mobileCards.querySelector("dt")?.textContent).toBe("Collected");
    expect(mobileCards.textContent).toContain("87%");
    expect(mobileCards.textContent).toContain("USD 1,400.00");
    expect(mobileCards.textContent).toContain("USD 572.60");
    expect(mobileCards.textContent).toContain("USD 827.40");
    expect(mobileCards.textContent).toContain("Not set");
  });

  it("requires explicit property selection before showing cash detail", () => {
    render(
      <OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />,
    );

    expect(
      screen.getByText("Select a property to explain its cash result."),
    ).toBeTruthy();
    expect(screen.queryByText("Selected property cash detail")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open owner statement" })).toBeNull();
  });

  it("shows supported property-finance detail links for an explicit selection", () => {
    render(
      <OverviewScreen
        data={operatingWorkspaceData}
        query={selectedPortfolioQuery}
      />,
    );

    expect(screen.getByText("Selected property cash detail")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cash income" }).getAttribute("href")).toBe(
      "/overview?lens=finance&financeView=collections&month=2026-07&propertyId=prop-1",
    );
    expect(
      screen.getByRole("link", { name: "Property expenses paid" }).getAttribute("href"),
    ).toBe(
      "/overview?lens=finance&financeView=expenses&month=2026-07&propertyId=prop-1",
    );
    expect(screen.getByRole("link", { name: "Management fee" }).getAttribute("href")).toBe(
      "/overview?lens=finance&financeView=management-fees&month=2026-07&propertyId=prop-1",
    );
    expect(screen.getByRole("link", { name: "Arrears" }).getAttribute("href")).toBe(
      "/overview?lens=finance&financeView=collections&month=2026-07&propertyId=prop-1&review=arrears",
    );
    expect(
      screen.getByRole("link", { name: "Open owner statement" }).getAttribute("href"),
    ).toBe("/reports/owner-statement?month=2026-07&propertyId=prop-1");
    expect(screen.getByText("Security deposit held")).toBeTruthy();
    expect(screen.getByText("Held tenant funds are separate from income and net cash.")).toBeTruthy();
  });

  it("preserves selected property state when opening statement blockers", () => {
    render(
      <OverviewScreen
        data={operatingWorkspaceData}
        query={selectedPortfolioQuery}
      />,
    );

    expect(screen.getByRole("link", { name: "Review blockers" }).getAttribute("href")).toBe(
      "/overview?month=2026-07&propertyId=prop-1&review=statement-blocked",
    );
  });

  it("keeps desktop and mobile scorecard facts and status equivalent", () => {
    render(
      <OverviewScreen
        data={operatingWorkspaceData}
        query={selectedPortfolioQuery}
      />,
    );

    const table = screen.getByRole("table");
    const cards = screen.getByRole("region", { name: "Property performance cards" });
    for (const fact of [
      "87%",
      "USD 1,400.00",
      "USD 572.60",
      "USD 827.40",
      "USD 112.00",
      "Not set",
      "Arrears",
    ]) {
      expect(within(table).getAllByText(fact).length).toBeGreaterThan(0);
      expect(within(cards).getAllByText(fact).length).toBeGreaterThan(0);
    }
  });

  it("preserves finance query state across every property-finance subview", () => {
    const financeQuery: OverviewViewQuery = {
      ...selectedPortfolioQuery,
      financeView: "expenses",
      lens: "finance",
      review: "arrears",
    };
    render(
      <PropertyFinanceWorkspace data={operatingWorkspaceData} query={financeQuery} />,
    );

    expect(screen.getByRole("heading", { name: "Expenses by property" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Attention and readiness" })).toBeTruthy();
    expect(screen.getByText("Expenses paid")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open property expenses" }).getAttribute("href")).toBe("/bills-expenses?dateBasis=paid&status=paid&month=2026-07&propertyId=prop-1");

    const expectedViews = {
      Collections: "collections",
      Expenses: "expenses",
      "Management fees": "management-fees",
      "Owner statements": "owner-statements",
      "Property transactions": "transactions",
    };
    for (const [label, financeView] of Object.entries(expectedViews)) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(
        `/overview?lens=finance&financeView=${financeView}&month=2026-07&propertyId=prop-1&review=arrears`,
      );
    }
  });
});

const portfolioQuery: OverviewViewQuery = {
  financeView: "collections",
  lens: "all",
  month: "2026-07",
  propertyId: "all",
  review: "all",
};

const selectedPortfolioQuery: OverviewViewQuery = {
  ...portfolioQuery,
  propertyId: "prop-1",
};

const emptyWorkspaceData: OverviewScreenData = {
  attentionItems: [],
  attentionTotal: 0,
  dashboardSummary: {
    actionHref: "/timeline",
    actionLabel: "Open timeline",
    detail: "No high-priority operating checks are open from the current data.",
    headline: "Portfolio is clear from the current checks.",
    tone: "success",
  },
  propertyPerformance: {
    rows: [],
    summary: {
      arrearsAmount: 0,
      cashExpensesAmount: 0,
      cashIncomeAmount: 0,
      collectionRate: 0,
      managementFeeEarnedAmount: 0,
      managementFeeOutstandingAmount: 0,
      managementFeeReceivedAmount: 0,
      netCashAmount: 0,
      statementReadiness: { blockedCount: 0, readyCount: 0, totalCount: 0 },
    },
  },
  leaseEndings: [],
  leaseRiskCount: 0,
  ledgerCurrency: "USD",
  ledgerFlow: [],
  metrics: [],
  occupancyByProperty: [],
  quickActions: [
    { href: "/import", label: "Import data" },
    { href: "/properties?action=create", label: "Add property" },
  ],
  recentChanges: [],
  workspaceSetup: {
    activeLeaseCount: 0,
    hasAnyOperatingData: false,
    ledgerEntryCount: 0,
    peopleCount: 0,
    propertyCount: 0,
    unitCount: 0,
  },
};

const operatingWorkspaceData: OverviewScreenData = {
  ...emptyWorkspaceData,
  attentionItems: [
    {
      count: 2,
      helper: "Last 30 days above review threshold",
      href: "/ledger?expenseBand=large",
      label: "Large expenses, 30d",
      tone: "warning",
    },
    {
      count: 1,
      helper: "Open cases",
      href: "/maintenance?review=open",
      label: "Open maintenance",
      tone: "warning",
    },
  ],
  attentionTotal: 3,
  leaseRiskCount: 2,
  leaseEndings: [{ count: 5, href: "/leases?endsWithin=180d", label: "Next 6 months" }],
  dashboardSummary: {
    actionHref: "#focus-now",
    actionLabel: "Review records",
    detail: "3 operating checks are open across the portfolio.",
    headline: "Portfolio needs a light operating review.",
    tone: "warning",
  },
  propertyPerformance: {
    rows: [
      {
        arrears: { primary: "USD 200.00" },
        arrearsAmount: 200,
        cashExpenses: { primary: "USD 572.60" },
        cashExpensesAmount: 572.6,
        cashIncome: { primary: "USD 1,400.00" },
        cashIncomeAmount: 1400,
        collectionRate: 87,
        href: "/properties/prop-1",
        label: "CTR / Satomi Dimitroff-Guorguieff",
        managementFeeEarned: { primary: "USD 112.00" },
        managementFeeEarnedAmount: 112,
        managementFeeOutstandingAmount: 0,
        managementFeeReceived: { primary: "USD 112.00" },
        managementFeeReceivedAmount: 112,
        netCash: { primary: "USD 827.40" },
        netCashAmount: 827.4,
        propertyId: "prop-1",
        securityDepositHeldAmount: 1400,
        statementBlockers: 0,
        status: "arrears",
        unitCount: 10,
      },
    ],
    summary: {
      arrearsAmount: 200,
      cashExpensesAmount: 572.6,
      cashIncomeAmount: 1400,
      collectionRate: 87,
      managementFeeEarnedAmount: 112,
      managementFeeOutstandingAmount: 0,
      managementFeeReceivedAmount: 112,
      netCashAmount: 827.4,
      statementReadiness: { blockedCount: 0, readyCount: 1, totalCount: 1 },
    },
  },
  ledgerFlow: [
    {
      expense: 600,
      href: "/ledger?period=current_month",
      income: 1000,
      label: "Jul",
      net: 400,
    },
  ],
  metrics: [
    {
      helper: "Occupied units",
      label: "Occupancy",
      tone: "success",
      value: "90%",
    },
    {
      helper: "Current tenant agreements",
      label: "Active leases",
      tone: "neutral",
      value: "9",
    },
    {
      helper: "Units without active lease",
      label: "Lease gaps",
      tone: "success",
      value: "0",
    },
    {
      helper: "Current month",
      label: "Ledger net",
      tone: "neutral",
      value: { primary: "USD 400.00" },
    },
    {
      helper: "Open operating checks",
      label: "Attention",
      tone: "warning",
      value: "3",
    },
  ],
  occupancyByProperty: [
    {
      href: "/properties/prop-1",
      label: "Central Residence",
      occupiedUnits: 9,
      percent: 90,
      totalUnits: 10,
      unoccupiedUnits: 1,
      vacantUnits: 1,
    },
  ],
  quickActions: [
    { href: "/ledger?action=create", label: "Add ledger" },
    { href: "/maintenance?action=create", label: "Add case" },
  ],
  workspaceSetup: {
    activeLeaseCount: 9,
    hasAnyOperatingData: true,
    ledgerEntryCount: 1,
    peopleCount: 12,
    propertyCount: 1,
    unitCount: 10,
  },
};
