/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

it("opens each delivered reminder from the expanded list", () => {
  render(<MaintenanceReminderNotifications reminders={[1, 2, 3].map((id) => ({ id: String(id), eventType: "reminder", deliveredAt: "2026-11-07T00:00:00Z", href: `/maintenance?taskId=${id}`, title: `Task ${id}` }))} />);
  fireEvent.click(screen.getByRole("button", { name: "View all 3 reminders" }));
  for (const id of [1, 2, 3]) expect(screen.getByRole("link", { name: `Task ${id}` }).getAttribute("href")).toBe(`/maintenance?taskId=${id}`);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss all notifications" }));
  expect(screen.queryByRole("complementary")).toBeNull();
});
