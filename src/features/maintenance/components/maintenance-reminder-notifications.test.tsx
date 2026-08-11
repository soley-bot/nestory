/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MaintenanceReminderNotifications } from "@/features/maintenance/components/maintenance-reminder-notifications";

afterEach(cleanup);

describe("MaintenanceReminderNotifications", () => {
  it("renders the durable in-app delivery feed without browser permission controls", () => {
    render(
      <MaintenanceReminderNotifications
        reminders={[
          {
            deliveredAt: "2026-08-11T09:00:00.000Z",
            eventType: "maintenance.reminder.due",
            href: "/maintenance?taskId=task-1",
            id: "outbox-1",
            title: "Inspect lift equipment",
          },
        ]}
      />,
    );

    expect(screen.getByText("Inspect lift equipment")).toBeTruthy();
    expect(screen.getByText("Delivered in app")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open reminder" }).getAttribute("href")).toBe(
      "/maintenance?taskId=task-1",
    );
    expect(screen.queryByText(/browser alerts/i)).toBeNull();
  });
});
