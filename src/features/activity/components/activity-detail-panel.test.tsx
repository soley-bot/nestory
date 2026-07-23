// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityDetailPanel } from "@/features/activity/components/activity-detail-panel";
import type { RecentChange } from "@/features/activity/activity.types";

afterEach(cleanup);

describe("ActivityDetailPanel", () => {
  it("keeps audit detail visible and links to the resolver-provided exact source", () => {
    render(
      <ActivityDetailPanel
        change={buildChange({
          href: "/rent-income?archiveState=all&incomeItemId=income-1",
          target: {
            actionLabel: "Open Rent & Income record",
            entityLabel: "Rent & Income",
            focusMode: "exact",
            href: "/rent-income?archiveState=all&incomeItemId=income-1",
            recordLabel: "John Smith",
          },
        })}
      />,
    );

    expect(screen.getByText("Amount received")).toBeVisible();
    expect(screen.getByText("USD 0")).toBeVisible();
    expect(screen.getByText("USD 500")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open Rent & Income record" }),
    ).toHaveAttribute(
      "href",
      "/rent-income?archiveState=all&incomeItemId=income-1",
    );
    expect(
      screen.getByText(
        "Opens the operational record that produced this audit entry.",
      ),
    ).toBeVisible();
  });

  it("shows controlled copy instead of a broken source action", () => {
    render(
      <ActivityDetailPanel
        change={buildChange({
          href: undefined,
          target: {
            actionLabel: "Source unavailable",
            entityLabel: "Unknown",
            focusMode: "unavailable",
            recordLabel: "Retained audit detail",
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "Source record is unavailable or you no longer have access.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Amount received")).toBeVisible();
  });
});

function buildChange(overrides: Partial<RecentChange>): RecentChange {
  return {
    action: "payment_recorded",
    actionLabel: "Payment recorded",
    createdAt: "2026-07-23T09:00:00.000Z",
    details: [
      {
        after: "USD 500",
        before: "USD 0",
        field: "Amount received",
      },
    ],
    entityLabel: "Rent & Income",
    href: "/rent-income?archiveState=all&incomeItemId=income-1",
    id: "activity-1",
    recordLabel: "John Smith",
    target: {
      actionLabel: "Open Rent & Income record",
      entityLabel: "Rent & Income",
      focusMode: "exact",
      href: "/rent-income?archiveState=all&incomeItemId=income-1",
      recordLabel: "John Smith",
    },
    tone: "neutral",
    ...overrides,
  };
}
