/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PeopleCommandCenter } from "@/features/people/components/people-command-center";
import type { PeopleInsights } from "@/features/people/people.insights";

afterEach(cleanup);

describe("PeopleCommandCenter", () => {
  it("stays out of the header when there is nothing actionable", () => {
    render(<PeopleCommandCenter insights={makeInsights()} />);

    expect(
      screen.queryByRole("button", { name: /people to review/i }),
    ).toBeNull();
  });

  it("shows only actionable nonzero queues", async () => {
    const user = userEvent.setup();
    render(
      <PeopleCommandCenter
        insights={makeInsights({
          missingContact: 2,
          missingEvidence: 3,
          vendorReview: 1,
        })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "3 people to review" }),
    );
    const dialog = screen.getByRole("dialog", { name: "People attention" });

    expect(
      within(dialog).getByRole("link", { name: /Missing contact.*2/ }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("link", { name: /Vendor review.*1/ }),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Evidence gaps")).toBeNull();
    expect(within(dialog).queryByText("No role")).toBeNull();
    expect(within(dialog).queryByText("People", { selector: "p" })).toBeNull();
  });
});

function makeInsights({
  missingContact = 0,
  missingEvidence = 0,
  missingRole = 0,
  vendorReview = 0,
}: {
  missingContact?: number;
  missingEvidence?: number;
  missingRole?: number;
  vendorReview?: number;
} = {}): PeopleInsights {
  return {
    attentionQueues: [
      {
        count: missingContact,
        description: "People records without a usable email or phone.",
        href: "/people?status=missing_contact",
        id: "missing-contact",
        label: "Missing contact",
        tone: missingContact > 0 ? "warning" : "success",
      },
      {
        count: missingRole,
        description: "Records without an operating role.",
        href: "/people?status=no_role",
        id: "missing-role",
        label: "No role",
        tone: missingRole > 0 ? "warning" : "success",
      },
      {
        count: missingEvidence,
        description: "Records without related evidence.",
        href: "/people",
        id: "missing-evidence",
        label: "Evidence gaps",
        tone: missingEvidence > 0 ? "warning" : "success",
      },
      {
        count: vendorReview,
        description: "Vendor records missing service context.",
        href: "/vendors",
        id: "vendor-review",
        label: "Vendor review",
        tone: vendorReview > 0 ? "warning" : "success",
      },
    ],
    metrics: [
      {
        helper: "Active directory records",
        href: "/people",
        label: "People",
        value: "13",
      },
    ],
    relationshipStats: [],
    totalCount: 13,
    visibleCount: 13,
  };
}
