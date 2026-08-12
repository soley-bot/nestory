import { describe, expect, it } from "vitest";

import { getOperatorActivityDetails } from "@/features/workspace-operations/operator-activity";

describe("getOperatorActivityDetails", () => {
  it("removes technical identifiers while preserving human workflow facts", () => {
    expect(
      getOperatorActivityDetails([
        { field: "Status", before: "Pending", after: "In progress" },
        {
          field: "Submission Id",
          before: "—",
          after: "031b68da-1111-2222-3333-444444444444",
        },
        {
          field: "Assignee Person Id",
          before: "—",
          after: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
        {
          field: "Vendor",
          before: "Unassigned",
          after: "Khmer Home Services",
        },
        { field: "Paid", before: "No", after: "Yes" },
      ]),
    ).toEqual([
      { field: "Status", before: "Pending", after: "In progress" },
      {
        field: "Vendor",
        before: "Unassigned",
        after: "Khmer Home Services",
      },
      { field: "Paid", before: "No", after: "Yes" },
    ]);
  });

  it("removes bare UUID and SHA-256 values even when their labels look ordinary", () => {
    expect(
      getOperatorActivityDetails([
        {
          field: "Reference",
          before: "—",
          after: "031b68da-1111-2222-3333-444444444444",
        },
        {
          field: "Evidence",
          before: "—",
          after: "a".repeat(64),
        },
        {
          field: "Reference",
          before: "—",
          after: "GDN-PUMP-2088",
        },
      ]),
    ).toEqual([
      {
        field: "Reference",
        before: "—",
        after: "GDN-PUMP-2088",
      },
    ]);
  });
});
