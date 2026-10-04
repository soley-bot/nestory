// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineInspector } from "@/features/timeline/components/timeline-inspector";
import type { TimelineEvent } from "@/features/timeline/timeline.types";

afterEach(cleanup);

describe("TimelineInspector source records", () => {
  it("shows exact sources, archived status, and a controlled unavailable origin", () => {
    render(<TimelineInspector event={makeEvent()} />);

    expect(screen.getByRole("heading", { name: "Source records" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open Maintenance source Leaking pipe" }),
    ).toHaveAttribute(
      "href",
      "/maintenance?archiveState=all&taskId=77777777-7777-4777-8777-777777777777",
    );
    expect(screen.getByText("Archived source")).toBeVisible();
    expect(screen.getByText("Source record unavailable")).toBeVisible();
    expect(
      screen.getByText("Source record is unavailable or you no longer have access."),
    ).toBeVisible();
  });

  it("does not render an empty source section for a manual Timeline event", () => {
    render(<TimelineInspector event={{ ...makeEvent(), sources: [] }} />);

    expect(
      screen.queryByRole("heading", { name: "Source records" }),
    ).not.toBeInTheDocument();
  });
});

function makeEvent(): TimelineEvent {
  return {
    activity: [],
    createdBy: "System",
    description: "Maintenance work",
    documents: [],
    eventDate: "2026-07-23",
    eventType: "Maintenance",
    hasAttachment: false,
    hrefs: {
      documents: "/documents",
      property: "/properties/11111111-1111-4111-8111-111111111111",
      timeline:
        "/timeline?archiveState=all&eventId=22222222-2222-4222-8222-222222222222",
    },
    id: "22222222-2222-4222-8222-222222222222",
    isLocked: false,
    nextAction: {
      description: "Review source records",
      href: "/timeline",
      label: "Review event",
      tone: "neutral",
    },
    propertyCode: "HOME",
    propertyId: "11111111-1111-4111-8111-111111111111",
    propertyName: "Home",
    recordCounts: { activity: 0, documents: 0, linkedRecords: 2 },
    riskIndicators: [],
    sources: [
      {
        availability: "available",
        entityId: "77777777-7777-4777-8777-777777777777",
        entityType: "task",
        href: "/maintenance?archiveState=all&taskId=77777777-7777-4777-8777-777777777777",
        isArchived: true,
        label: "Leaking pipe",
        moduleLabel: "Maintenance",
      },
      {
        availability: "unavailable",
        entityType: "petty_cash_entry",
        label: "Source record unavailable",
        moduleLabel: "Petty Cash",
      },
    ],
    title: "Leaking pipe repaired",
  };
}

describe("TimelineInspector event history", () => {
  it("labels an empty preview as incomplete and offers the explicit scoped path", () => {
    render(<TimelineInspector event={makeEvent()} historyHref="/maintenance-timeline?eventId=event-1&historyPage=1" />);
    expect(screen.getByText("Event history is not fully loaded in this preview.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open event history" })).toHaveAttribute("href", "/maintenance-timeline?eventId=event-1&historyPage=1");
    expect(screen.queryByText("No recorded event changes available.")).toBeNull();
  });

  it("shows a counted page with older/newer controls and existing change details", () => {
    const onSelectChange = vi.fn();
    const change = { id: "change-1", action: "updated", actionLabel: "Updated", createdAt: "2026-07-20T12:00:00Z", recordLabel: "Synthetic event update", entityLabel: "Timeline", details: [], tone: "neutral" as const };
    render(<TimelineInspector event={{ ...makeEvent(), activity: [change], activityPagination: { from: 51, to: 100, page: 2, pageSize: 50, totalCount: 130, totalPages: 3 } }} onSelectChange={onSelectChange} newerHistoryHref="/maintenance-timeline?historyPage=1" olderHistoryHref="/maintenance-timeline?historyPage=3" />);
    expect(screen.getByText("Showing 1 recorded event changes, 130 available")).toBeVisible();
    expect(screen.getByRole("link", { name: "Older changes" })).toHaveAttribute("href", "/maintenance-timeline?historyPage=3");
    expect(screen.getByRole("link", { name: "Newer changes" })).toHaveAttribute("href", "/maintenance-timeline?historyPage=1");
    fireEvent.click(screen.getByRole("button", { name: /Synthetic event update/ }));
    expect(onSelectChange).toHaveBeenCalledWith(change);
  });

  it("shows an empty state only for a successfully counted empty event", () => {
    render(<TimelineInspector event={{ ...makeEvent(), activityPagination: { from: 0, to: 0, page: 1, pageSize: 50, totalCount: 0, totalPages: 1 } }} />);
    expect(screen.getByText("No recorded event changes available.")).toBeVisible();
    expect(screen.queryByText(/not fully loaded/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Older changes" })).toBeNull();
  });

  it("shows a retryable error without claiming zero history or exposing stale pages", () => {
    render(<TimelineInspector event={{ ...makeEvent(), activityError: "Event history could not be loaded. Try again." }} historyHref="/property-timeline?eventId=event-1&historyPage=1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Event history could not be loaded.");
    expect(screen.getByRole("link", { name: "Retry event history" })).toHaveAttribute("href", "/property-timeline?eventId=event-1&historyPage=1");
    expect(screen.queryByText("No recorded event changes available.")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Event history pages" })).toBeNull();
  });
});
