/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import type { OverviewScreenData } from "@/features/overview/overview.types";

describe("OverviewScreen", () => {
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
          (link) =>
            link.getAttribute("href") === "/properties?action=create",
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

  it("shows the selected overview lens as URL-backed tabs", () => {
    render(<OverviewScreen data={operatingWorkspaceData} lens="finance" />);

    const financeTab = screen.getByTitle("Cash, arrears, and posting queues");

    expect(financeTab.getAttribute("href")).toBe("/overview?lens=finance");
    expect(financeTab.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Company P&L" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByText("Company P&L trend")).toBeTruthy();
    expect(screen.getByText("Company net P&L")).toBeTruthy();
    expect(screen.getByTitle("Open cases and repair pressure").getAttribute("href")).toBe(
      "/overview?lens=maintenance",
    );
  });

  it("preserves finance subtab URL state", () => {
    render(
      <OverviewScreen
        data={operatingWorkspaceData}
        financeView="property-ranking"
        lens="finance"
      />,
    );

    const propertyRankingTab = screen
      .getAllByRole("link", { name: "Property Ranking" })
      .find((link) => link.getAttribute("aria-current") === "page");

    expect(propertyRankingTab).toBeTruthy();
    expect(screen.getByText("CTR / Central Residence")).toBeTruthy();
  });
});

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
  companyFinance: {
    companyCost: { primary: "USD 0.00" },
    companyCostAmount: 0,
    companyNet: { primary: "USD 0.00" },
    companyNetAmount: 0,
    companyRevenue: { primary: "USD 0.00" },
    companyRevenueAmount: 0,
    marginLabel: "No revenue",
    monthlyPnl: [],
    ownerReceivable: { primary: "USD 0.00" },
    ownerReceivableAmount: 0,
    ownerReceivables: [],
    properties: [],
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
  dashboardSummary: {
    actionHref: "#focus-now",
    actionLabel: "Review records",
    detail: "3 operating checks are open across the portfolio.",
    headline: "Portfolio needs a light operating review.",
    tone: "warning",
  },
  companyFinance: {
    companyCost: { primary: "USD 120.00" },
    companyCostAmount: 120,
    companyNet: { primary: "USD 380.00" },
    companyNetAmount: 380,
    companyRevenue: { primary: "USD 500.00" },
    companyRevenueAmount: 500,
    marginLabel: "76%",
    monthlyPnl: [
      {
        expense: 120,
        href: "/overview?lens=finance&financeView=company-pnl",
        income: 500,
        label: "Jul",
        net: 380,
      },
    ],
    ownerReceivable: { primary: "USD 90.00" },
    ownerReceivableAmount: 90,
    ownerReceivables: [
      {
        amount: { primary: "USD 100.00" },
        amountValue: 100,
        billStatus: "Billable",
        href: "/bills-expenses?propertyId=prop-1&query=AC%20Vendor",
        invoiceDate: "2026-07-01",
        label: "Maintenance",
        ownerReceivable: { primary: "USD 90.00" },
        ownerReceivableAmount: 90,
        propertyLabel: "CTR / Central Residence",
        reimbursed: { primary: "USD 10.00" },
        vendorLabel: "AC Vendor",
      },
    ],
    properties: [
      {
        companyCost: { primary: "USD 120.00" },
        companyCostAmount: 120,
        companyRevenue: { primary: "USD 500.00" },
        companyRevenueAmount: 500,
        href: "/properties/prop-1",
        label: "CTR / Central Residence",
        marginLabel: "76%",
        netContribution: { primary: "USD 380.00" },
        netContributionAmount: 380,
        ownerReceivable: { primary: "USD 90.00" },
        ownerReceivableAmount: 90,
        tone: "success",
      },
    ],
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
