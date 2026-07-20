import { describe, expect, it } from "vitest";
import { getMaintenanceTaskFacts } from "@/features/maintenance/maintenance.facts";

const today = "2026-07-20";

describe("getMaintenanceTaskFacts", () => {
  it.each([
    ["pending", "pending", true, false],
    ["scheduled", "scheduled", true, false],
    ["in progress", "in_progress", true, false],
    ["blocked", "blocked", true, true],
    ["ready-for-review", "ready_for_review", true, false],
    ["completed", "completed", false, false],
    ["cancelled", "cancelled", false, false],
    ["unsupported", "pending", true, false],
  ] as const)(
    "normalizes status %s to %s",
    (status, expectedStatus, isOpen, isBlocked) => {
      const facts = getMaintenanceTaskFacts(
        { dueDate: null, priority: "normal", status },
        today,
      );

      expect(facts.status).toBe(expectedStatus);
      expect(facts.isOpen).toBe(isOpen);
      expect(facts.isBlocked).toBe(isBlocked);
    },
  );

  it.each([
    ["low", "low", false],
    ["normal", "normal", false],
    ["HIGH", "high", true],
    ["urgent", "urgent", true],
    ["unsupported", "normal", false],
  ] as const)(
    "normalizes priority %s to %s",
    (priority, expectedPriority, isHighPriority) => {
      const facts = getMaintenanceTaskFacts(
        { dueDate: null, priority, status: "pending" },
        today,
      );

      expect(facts.priority).toBe(expectedPriority);
      expect(facts.isHighPriority).toBe(isHighPriority);
    },
  );

  it.each([
    ["pending", null, "open"],
    ["scheduled", null, "scheduled"],
    ["pending", "2026-07-19", "overdue"],
    ["pending", today, "due_today"],
    ["pending", "2026-07-27", "upcoming"],
    ["pending", "2026-07-28", "scheduled"],
    ["ready_for_review", "2026-07-19", "overdue"],
  ] as const)(
    "classifies %s with due date %s as %s",
    (status, dueDate, progressState) => {
      expect(
        getMaintenanceTaskFacts({ dueDate, priority: "normal", status }, today)
          .progressState,
      ).toBe(progressState);
    },
  );

  it.each(["completed", "cancelled"] as const)(
    "keeps terminal status %s out of overdue work",
    (status) => {
      const facts = getMaintenanceTaskFacts(
        { dueDate: "2026-07-19", priority: "urgent", status },
        today,
      );

      expect(facts.isOpen).toBe(false);
      expect(facts.isOverdue).toBe(false);
      expect(facts.progressState).toBe(status);
    },
  );
});
