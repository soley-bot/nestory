import { describe, expect, it } from "vitest";
import {
  getMaintenanceReminderDelayMs,
  isMaintenanceReminderRelevant,
} from "@/features/maintenance/maintenance.notifications";

describe("maintenance notification scheduling", () => {
  it("fires due reminders now, schedules near future reminders, and skips far reminders", () => {
    const nowMs = Date.parse("2026-07-01T14:45:00");

    expect(
      getMaintenanceReminderDelayMs({
        nowMs,
        reminderAt: "2026-07-01T14:45:00",
      }),
    ).toBe(0);
    expect(
      getMaintenanceReminderDelayMs({
        nowMs,
        reminderAt: "2026-07-01T15:00:00",
      }),
    ).toBe(15 * 60 * 1_000);
    expect(
      getMaintenanceReminderDelayMs({
        maxDelayMs: 60_000,
        nowMs,
        reminderAt: "2026-07-01T15:00:00",
      }),
    ).toBeNull();
    expect(
      getMaintenanceReminderDelayMs({
        nowMs,
        reminderAt: "not-a-date",
      }),
    ).toBeNull();
    expect(
      isMaintenanceReminderRelevant({
        nowMs,
        reminderAt: "2026-07-01T15:00:00",
      }),
    ).toBe(true);
    expect(
      isMaintenanceReminderRelevant({
        maxDelayMs: 60_000,
        nowMs,
        reminderAt: "2026-07-01T15:00:00",
      }),
    ).toBe(false);
  });
});
