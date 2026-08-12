import { describe, expect, it } from "vitest";

import { buildAdminWorkspaceQueue } from "@/features/workspace-operations/admin-workspace";
import type { OverviewAttentionItem } from "@/features/overview/overview.types";

describe("buildAdminWorkspaceQueue", () => {
  it("removes empty checks and orders actionable attention without mutating input", () => {
    const input = [
      attention({ count: 4, id: "records", priority: 30 }),
      attention({ count: 2, id: "finance", priority: 10 }),
      attention({ count: 3, id: "maintenance", priority: 10 }),
      attention({ count: 0, id: "empty", priority: 1 }),
    ];

    expect(
      buildAdminWorkspaceQueue({ attentionItems: input }).map(
        (item) => item.id,
      ),
    ).toEqual(["maintenance", "finance", "records"]);
    expect(input.map((item) => item.id)).toEqual([
      "records",
      "finance",
      "maintenance",
      "empty",
    ]);
  });

  it("uses the stable item id when priority and count are equal", () => {
    const result = buildAdminWorkspaceQueue({
      attentionItems: [
        attention({ count: 2, id: "zeta", priority: 10 }),
        attention({ count: 2, id: "alpha", priority: 10 }),
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["alpha", "zeta"]);
  });
});

function attention(
  overrides: Partial<OverviewAttentionItem>,
): OverviewAttentionItem {
  return {
    actionLabel: "Review",
    count: 1,
    helper: "Needs attention",
    href: "/overview",
    id: "attention-item",
    kind: "data-quality",
    label: "Operating check",
    priority: 20,
    tone: "warning",
    ...overrides,
  };
}
