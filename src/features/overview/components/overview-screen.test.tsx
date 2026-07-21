/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OverviewDetailPage } from "@/features/overview/components/overview-detail-page";
import { afterEach, describe, expect, it } from "vitest";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { PropertyFinanceWorkspace, rankFinanceRows } from "@/features/overview/components/property-finance-workspace";
import type {
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

afterEach(cleanup);

describe("OverviewScreen", () => {
  it("uses real property record checks and moves readiness detail into a modal", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...portfolioQuery, lens: "records" }} />);

    expect(screen.getByRole("heading", { name: "Record readiness" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Attention and readiness" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Supporting evidence" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Central Residence/ }));

    const dialog = screen.getByRole("dialog", { name: "Central Residence" });
    expect(within(dialog).getByText("Owner linked").parentElement?.textContent).toContain("No");
    expect(within(dialog).getByText("Missing tenant links").parentElement?.textContent).toContain("1");
    expect(within(dialog).getByText("Documents").parentElement?.textContent).toContain("3");
    expect(within(dialog).getByRole("link", { name: /Open property record/ }).getAttribute("href")).toBe(
      "/properties/prop-1",
    );
  });

  it("keeps authoritative statement readiness independent from record-link quality", () => {
    const data = {
      ...operatingWorkspaceData,
      recordsByProperty: [
        {
          ...operatingWorkspaceData.recordsByProperty[0],
          missingTenantLinks: 0,
          ownerLinked: false,
          readyStatementCount: 1,
          statementBlockers: 0,
        },
      ],
    };
    render(<OverviewScreen data={data} query={{ ...portfolioQuery, lens: "records" }} />);

    expect(screen.getAllByText("1 owner statement ready").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Central Residence/ }));

    const dialog = screen.getByRole("dialog", { name: "Central Residence" });
    expect(within(dialog).getByText("Statement status").parentElement?.textContent).toContain(
      "Ready",
    );
    expect(within(dialog).getByText("Record quality").parentElement?.textContent).toContain(
      "Needs review",
    );
    expect(within(dialog).getByText(/Record-quality issue: link an owner/)).toBeTruthy();
  });

  it("uses exact lens counts and preserves supported destination state", () => {
    const query = { ...selectedPortfolioQuery, lens: "maintenance" as const };
    render(<OverviewScreen data={operatingWorkspaceData} query={query} />);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Overdue/ }).getAttribute("href")).toBe("/maintenance?review=overdue&month=2026-07&propertyId=prop-1");
    expect(screen.getByRole("link", { name: /High priority/ }).getAttribute("href")).toBe("/maintenance?review=high_priority&month=2026-07&propertyId=prop-1");
    expect(screen.getByRole("link", { name: /Properties with work/ }).getAttribute("href")).toBe("/maintenance?review=open&month=2026-07&propertyId=prop-1");
  });

  it("uses real maintenance property rows and moves work detail into a modal", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...selectedPortfolioQuery, lens: "maintenance" }} />);

    expect(screen.getByRole("link", { name: /Open work/ }).textContent).toContain("1");
    expect(screen.getByRole("link", { name: /Overdue/ }).textContent).toContain("1");
    expect(screen.getByRole("link", { name: /High priority/ }).textContent).toContain("1");
    expect(screen.queryByRole("heading", { name: "Attention and readiness" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Supporting evidence" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Central Residence/ }));
    const dialog = screen.getByRole("dialog", { name: "Central Residence" });
    expect(within(dialog).getByText("Leaking pipe")).toBeTruthy();
    expect(within(dialog).getByText("Open cases").parentElement?.textContent).toContain("1");
    expect(within(dialog).getByRole("link", { name: /Open property maintenance/ }).getAttribute("href")).toBe(
      "/maintenance?review=open&propertyId=prop-1",
    );
    expect(within(dialog).getByRole("link", { name: /Leaking pipe/ }).getAttribute("href")).toBe(
      "/maintenance?taskId=task-1",
    );
  });

  it("shows the active lens in the breadcrumb and changes the reporting month from an explicit picker", () => {
    const { rerender } = render(<OverviewScreen data={operatingWorkspaceData} query={{ ...portfolioQuery, lens: "leasing" }} />);

    expect(screen.getAllByRole("link", { name: "Leasing" }).length).toBeGreaterThan(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change reporting month, currently July 2026",
      }),
    );
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Jun" }).getAttribute("href")).toBe(
      "/overview?lens=leasing&month=2026-06",
    );
    expect(screen.getByRole("link", { name: "Jul" }).getAttribute("aria-current")).toBe("date");

    rerender(<OverviewScreen data={operatingWorkspaceData} query={{ ...portfolioQuery, lens: "all" }} />);
    expect(screen.getAllByRole("link", { name: "Overview" })).toHaveLength(1);
    expect(
      screen
        .getAllByRole("link", { name: "Portfolio" })
        .every((link) => link.getAttribute("href") === "/overview?month=2026-07"),
    ).toBe(true);
  });

  it("uses the actual 60-day lease risk count and opens leasing detail without filtering the page", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...selectedPortfolioQuery, lens: "leasing" }} />);
    const expiry = screen.getByRole("link", { name: /Lease expiries/ });
    expect(expiry.textContent).toContain("2");
    expect(expiry.getAttribute("href")).toContain("propertyId=prop-1");
    expect(screen.queryByRole("heading", { name: "Attention and readiness" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Central Residence/ }));
    const dialog = screen.getByRole("dialog", { name: "Central Residence" });
    expect(within(dialog).getByText("90%")).toBeTruthy();
    expect(within(dialog).getByText("9 of 10")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Attention and readiness" })).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Open property record/ }).getAttribute("href")).toBe("/properties/prop-1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /Central Residence/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Active leases/ }).getAttribute("href")).toBe("/leases?status=current&propertyId=prop-1");
    expect(screen.getByRole("link", { name: /Properties ranked/ }).getAttribute("href")).toBe("/overview?lens=leasing&month=2026-07&propertyId=prop-1");
  });

  it("keeps records blockers separate and preserves internal review state", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...selectedPortfolioQuery, lens: "records" }} />);
    expect(screen.getByRole("link", { name: /Blocked properties/ }).getAttribute("href")).toBe("/overview?lens=records&month=2026-07&propertyId=prop-1&review=statement-blocked");
    expect(screen.getByRole("link", { name: /Owner statements ready/ }).getAttribute("href")).toBe(
      "/reports/owner-statement?month=2026-07&propertyId=prop-1",
    );
    expect(screen.getAllByText("Not calculated").length).toBeGreaterThan(0);
  });

  it("opens the parser-backed management fee family with month and property state", () => {
    render(<PropertyFinanceWorkspace data={operatingWorkspaceData} query={{ ...selectedPortfolioQuery, lens: "finance", financeView: "management-fees" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Satomi/ }));
    expect(screen.getByRole("link", { name: /Open management fees/ }).getAttribute("href")).toBe("/rent-income?incomeScope=management-fees&month=2026-07&propertyId=prop-1");
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
    const addPropertyLink = screen.getByRole("link", {
      name: /add first property/i,
    });
    expect(addPropertyLink.className).toContain("bg-foreground");
    expect(addPropertyLink.className).toContain("text-background");
    expect(
      screen
        .getAllByRole("link", { name: /open imports/i })
        .every((link) => link.getAttribute("href") === "/import"),
    ).toBe(true);
    expect(screen.getByText("Import center")).toBeTruthy();
    expect(screen.getByText("500 valid rows per commit")).toBeTruthy();
    expect(screen.queryByText("Setup needed")).toBeNull();
    const onboarding = document.querySelector(
      '[data-slot="empty-workspace-onboarding"]',
    );
    expect(onboarding?.querySelector(".rounded-lg")).toBeNull();
    expect(screen.queryByText(/not people or leases/i)).toBeNull();
  });

  it("shows every URL-backed operating lens without company accounting copy", () => {
    render(<OverviewScreen data={operatingWorkspaceData} query={{ ...portfolioQuery, lens: "finance" }} />);
    expect(screen.getAllByRole("link", { name: "Property finance" }).some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
    expect(screen.getByRole("link", { name: "Maintenance" }).getAttribute("href")).toContain("lens=maintenance");
    expect(screen.queryByText("Company P&L")).toBeNull();
  });

  it("opens a cash-basis property preview with a canonical record link", () => {
    render(
      <OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />,
    );

    expect(
      screen.getByRole("heading", { name: "Property performance" }),
    ).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: /Satomi Dimitroff-Guorguieff/,
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "CTR / Satomi Dimitroff-Guorguieff",
    });
    expect(
      within(dialog)
        .getByRole("link", { name: /Open full property record/ })
        .getAttribute("href"),
    ).toBe("/properties/prop-1");
    expect(screen.getAllByText("USD 827.40").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cash basis")).toBeNull();
    expect(screen.queryByText("Company P&L")).toBeNull();
  });

  it("summarizes attention, income, and expense in three compact cards", () => {
    render(
      <OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />,
    );

    const summary = screen.getByRole("region", { name: "Overview summary" });
    const performance = screen.getByRole("heading", {
      name: "Property performance",
    });
    expect(
      summary.compareDocumentPosition(performance) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(summary).getByRole("button", { name: /Needs attention/ })).toBeTruthy();
    expect(within(summary).getByRole("button", { name: /Income/ })).toBeTruthy();
    expect(within(summary).getByRole("button", { name: /Expense/ })).toBeTruthy();
    expect(within(summary).getByText("3 open checks")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Portfolio cash metrics" })).toBeNull();
  });

  it("moves finance attention context into the property preview modal", () => {
    render(
      <PropertyFinanceWorkspace
        data={operatingWorkspaceData}
        query={{
          ...selectedPortfolioQuery,
          financeView: "collections",
          lens: "finance",
        }}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Attention and readiness" }),
    ).toBeNull();

    fireEvent.click(
      screen.getAllByRole("button", { name: /Satomi Dimitroff-Guorguieff/ })[0],
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Attention and readiness" }),
    ).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Review arrears/ }).getAttribute("href")).toBe(
      "/overview?lens=finance&financeView=collections&month=2026-07&propertyId=prop-1&review=arrears",
    );
  });

  it("opens summary detail in a modal and retains a full breadcrumb workspace link", () => {
    render(
      <OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Needs attention/ }));
    const dialog = screen.getByRole("dialog", { name: "Needs attention" });
    expect(within(dialog).getByText("Review maintenance")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Open full workspace/ }).getAttribute("href")).toBe(
      "/overview/attention?month=2026-07",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
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

  it("does not render a property inspector or detail modal on the dashboard", () => {
    render(
      <OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open owner statement" })).toBeNull();
  });

  it("uses property search for an instant preview without filtering the table", () => {
    render(
      <OverviewScreen
        data={operatingWorkspaceData}
        query={portfolioQuery}
      />,
    );

    const table = screen.getByRole("table");
    const rowCount = within(table).getAllByRole("row").length;
    fireEvent.change(screen.getByPlaceholderText("Find a property…"), {
      target: { value: "Satomi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search properties" }));
    expect(screen.getByRole("dialog", { name: "CTR / Satomi Dimitroff-Guorguieff" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(table).getAllByRole("row")).toHaveLength(rowCount);
  });

  it("opens statement readiness as a dedicated Overview page", () => {
    render(
      <OverviewScreen
        data={operatingWorkspaceData}
        query={selectedPortfolioQuery}
      />,
    );

    expect(screen.getByText("1 ready property")).toBeTruthy();
    expect(screen.getByText("1 total property")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Review readiness/ }).getAttribute("href")).toBe(
      "/overview/readiness?month=2026-07&propertyId=prop-1",
    );
  });

  it.each([
    ["attention", "Needs attention", "Review maintenance"],
    ["readiness", "Statement readiness", "CTR / Satomi Dimitroff-Guorguieff"],
  ] as const)("renders the %s workspace as a breadcrumb detail page", (view, title, action) => {
    render(<OverviewDetailPage data={operatingWorkspaceData} query={selectedPortfolioQuery} view={view} />);

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "Overview" }).getAttribute("href")).toBe(
      "/overview?month=2026-07&propertyId=prop-1",
    );
    expect(within(breadcrumb).getByText(title)).toBeTruthy();
    expect(screen.getByText(action)).toBeTruthy();
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
    expect(screen.queryByRole("heading", { name: "Attention and readiness" })).toBeNull();
    expect(screen.getByText("Expenses paid")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Satomi/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Expenses paid")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Open property expenses/ }).getAttribute("href")).toBe("/bills-expenses?dateBasis=paid&status=paid&month=2026-07&propertyId=prop-1");

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
      statementReadiness: {
        blockedPropertyCount: 0,
        readyPropertyCount: 0,
        readyStatementCount: 0,
        totalPropertyCount: 0,
      },
    },
  },
  leaseEndings: [],
  leaseRiskCount: 0,
  ledgerCurrency: "USD",
  ledgerFlow: [],
  maintenanceByProperty: [],
  metrics: [],
  occupancyByProperty: [],
  recordsByProperty: [],
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
      actionLabel: "Review expenses",
      count: 2,
      helper: "Last 30 days above review threshold",
      href: "/ledger?expenseBand=large",
      id: "large-recent-expenses",
      kind: "unreconciled-finance",
      label: "Large expenses, 30d",
      priority: 140,
      tone: "warning",
    },
    {
      actionLabel: "Review maintenance",
      count: 1,
      helper: "Open cases",
      href: "/maintenance?review=open",
      id: "open-maintenance",
      kind: "urgent-maintenance",
      label: "Open maintenance",
      priority: 70,
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
        readyStatementCount: 1,
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
      statementReadiness: {
        blockedPropertyCount: 0,
        readyPropertyCount: 1,
        readyStatementCount: 1,
        totalPropertyCount: 1,
      },
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
  maintenanceByProperty: [
    {
      blockedCount: 0,
      cases: [
        {
          dueDate: "2026-07-01",
          href: "/maintenance?taskId=task-1",
          id: "task-1",
          priority: "urgent",
          status: "in_progress",
          title: "Leaking pipe",
        },
      ],
      href: "/maintenance?review=open&propertyId=prop-1",
      label: "Central Residence",
      openCount: 1,
      overdueCount: 1,
      urgentCount: 1,
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
  recordsByProperty: [
    {
      documentCount: 3,
      href: "/properties/prop-1",
      label: "Central Residence",
      missingTenantLinks: 1,
      ownerLinked: false,
      readyStatementCount: 1,
      statementBlockers: 0,
      unitCount: 10,
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
