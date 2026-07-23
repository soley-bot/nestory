// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
