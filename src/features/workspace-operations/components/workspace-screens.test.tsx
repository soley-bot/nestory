/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminWorkspaceQueue } from "@/features/workspace-operations/components/admin-workspace-queue";
import {
  FinanceManagerWorkspace,
  FinanceMemberWorkspace,
} from "@/features/workspace-operations/components/finance-workspace-screen";
import type {
  FinanceManagerWorkspaceData,
  FinanceMemberWorkspaceData,
  FinanceWorkspaceQueueItem,
} from "@/features/workspace-operations/finance-workspace.types";
import type { OverviewAttentionItem } from "@/features/overview/overview.types";

afterEach(cleanup);

function queueItem(
  overrides: Partial<FinanceWorkspaceQueueItem> = {},
): FinanceWorkspaceQueueItem {
  return {
    actionLabel: "Review",
    amountDisplay: { primary: "USD 480.00" },
    contextLabel: "Unit A-01 / Riverside Shophouse",
    detail: "Maintenance handoff awaiting review",
    href: "/bills-expenses?submission=submission-1",
    id: "submission-1",
    kind: "maintenance-cost-review",
    priority: 1,
    statusLabel: "Maintenance handoff",
    submittedAt: "2026-08-06T09:00:00.000Z",
    submittedByLabel: "mony.rath@example.test",
    title: "Aircon compressor replacement",
    tone: "accent",
    ...overrides,
  };
}

const managerData: FinanceManagerWorkspaceData = {
  queue: [
    queueItem(),
    queueItem({
      amountDisplay: null,
      id: "submission-2",
      submittedByLabel: null,
      title: "Lobby repaint materials",
      tone: "danger",
      statusLabel: "Missing evidence",
    }),
  ],
  role: "finance_manager",
  totals: {
    awaitingReview: 2,
    maintenanceHandoffs: 1,
    missingEvidence: 1,
    rentExceptions: 0,
  },
};

const memberData: FinanceMemberWorkspaceData = {
  primaryAction: {
    href: "/bills-expenses?action=create",
    intent: "record-paid-cost",
    label: "Record paid cost",
  },
  queue: [
    queueItem({
      actionLabel: "Open",
      detail: "Evidence photo was unreadable",
      id: "own-1",
      kind: "expense-rejected",
      statusLabel: "Rejected",
      tone: "danger",
    }),
  ],
  role: "finance_member",
  totals: { approvedRecently: 0, awaitingReview: 0, rejected: 1 },
};

describe("Finance Manager workspace", () => {
  it("maps every visible value to a contract field", () => {
    render(<FinanceManagerWorkspace data={managerData} />);

    const queue = screen.getByRole("table", { name: "Review queue" });
    const firstRow = within(queue).getAllByRole("row")[1]!;

    expect(within(firstRow).getByText("Aircon compressor replacement")).toBeTruthy();
    expect(
      within(firstRow).getByText("Unit A-01 / Riverside Shophouse"),
    ).toBeTruthy();
    expect(within(firstRow).getByText("mony.rath@example.test")).toBeTruthy();
    expect(within(firstRow).getByText("USD 480.00")).toBeTruthy();
    expect(within(firstRow).getByText("Maintenance handoff")).toBeTruthy();
    expect(
      within(firstRow).getByRole("link", { name: "Review" }).getAttribute("href"),
    ).toBe("/bills-expenses?submission=submission-1");
  });

  it("renders the queue in projection order without re-sorting", () => {
    render(<FinanceManagerWorkspace data={managerData} />);

    const rows = within(
      screen.getByRole("table", { name: "Review queue" }),
    ).getAllByRole("row");

    expect(rows[1]?.textContent).toContain("Aircon compressor replacement");
    expect(rows[2]?.textContent).toContain("Lobby repaint materials");
  });

  it("shows an em dash where the contract allows null", () => {
    render(<FinanceManagerWorkspace data={managerData} />);

    const secondRow = within(
      screen.getByRole("table", { name: "Review queue" }),
    ).getAllByRole("row")[2]!;

    expect(secondRow.textContent).toContain("—");
  });

  it("hides zero-count chips and keeps the live ones", () => {
    const { container } = render(<FinanceManagerWorkspace data={managerData} />);
    const chips = container.querySelector('[data-slot="workspace-chips"]');

    expect(chips?.textContent).toContain("Awaiting review");
    expect(chips?.textContent).toContain("Missing evidence");
    expect(chips?.textContent).not.toContain("Rent exceptions");
  });

  it("states the fact without a restating body when the queue is clear", () => {
    render(
      <FinanceManagerWorkspace
        data={{
          ...managerData,
          queue: [],
          totals: {
            awaitingReview: 0,
            maintenanceHandoffs: 0,
            missingEvidence: 0,
            rentExceptions: 0,
          },
        }}
      />,
    );

    expect(screen.getByText("Nothing waiting for review")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("Finance Member workspace", () => {
  it("renders its own queue with no review controls", () => {
    render(<FinanceMemberWorkspace data={memberData} />);

    const queue = screen.getByRole("table", { name: "Submission queue" });

    expect(within(queue).getByText("Rejected")).toBeTruthy();
    expect(within(queue).getByText("Evidence photo was unreadable")).toBeTruthy();
    expect(within(queue).queryByRole("link", { name: "Review" })).toBeNull();
    expect(within(queue).queryByText("Submitted by")).toBeNull();
  });

  it("uses property and unit context when the row is not rejected", () => {
    render(
      <FinanceMemberWorkspace
        data={{
          ...memberData,
          queue: [
            queueItem({
              actionLabel: "Open",
              contextLabel: "Garden Court · Unit G-01",
              detail: "Quarterly pest control",
              id: "own-awaiting",
              kind: "expense-awaiting-review",
              statusLabel: "Awaiting review",
              tone: "warning",
            }),
          ],
        }}
      />,
    );

    const row = within(
      screen.getByRole("table", { name: "Submission queue" }),
    ).getAllByRole("row")[1]!;

    expect(within(row).getByText("Garden Court · Unit G-01")).toBeTruthy();
    expect(within(row).queryByText("Quarterly pest control")).toBeNull();
  });

  it("offers the contract primary action when nothing has been submitted", () => {
    render(
      <FinanceMemberWorkspace
        data={{
          ...memberData,
          queue: [],
          totals: { approvedRecently: 0, awaitingReview: 0, rejected: 0 },
        }}
      />,
    );

    expect(screen.getByText("No submissions yet")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Record paid cost" }).getAttribute("href"),
    ).toBe("/bills-expenses?action=create");
  });
});

describe("Super Admin workspace queue", () => {
  const attention: OverviewAttentionItem[] = [
    {
      actionLabel: "Open rent",
      count: 3,
      helper: "Collections behind for the current month",
      href: "/rent-income",
      id: "rent",
      kind: "overdue-rent",
      label: "Rent exceptions",
      priority: 10,
      tone: "warning",
    },
  ];

  it("renders the projection as given", () => {
    render(<AdminWorkspaceQueue items={attention} />);

    const row = within(
      screen.getByRole("table", { name: "Attention queue" }),
    ).getAllByRole("row")[1]!;

    expect(within(row).getByText("Rent exceptions")).toBeTruthy();
    expect(
      within(row).getByText("Collections behind for the current month"),
    ).toBeTruthy();
    expect(within(row).getByText("3")).toBeTruthy();
    expect(
      within(row).getByRole("link", { name: "Open rent" }).getAttribute("href"),
    ).toBe("/rent-income");
  });

  it("reports a clear portfolio without inventing a queue", () => {
    render(<AdminWorkspaceQueue items={[]} />);

    expect(screen.getByText("Nothing needs attention")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
