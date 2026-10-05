/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { BusinessDateProvider } from "@/lib/dates/business-date-provider";

function openCalendar(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

function selectableDays() {
  return within(screen.getByRole("grid"))
    .getAllByRole("gridcell")
    .filter((cell) => {
      const button = cell.querySelector("button");
      return Boolean(button) && !button!.hasAttribute("disabled");
    });
}

describe("DatePickerField", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each([
    ["Asia/Phnom_Penh", "2027-01-01"],
    ["UTC", "2026-12-31"],
  ])("uses the company's %s date for Today and its highlight", (timeZone, businessDate) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T17:00:00Z"));
    const { container } = render(<BusinessDateProvider businessDate={businessDate} timeZone={timeZone}><DatePickerField ariaLabel="Payment date" defaultValue={businessDate} name="paymentDate" /></BusinessDateProvider>);
    openCalendar("Payment date");
    expect(screen.getByRole("grid").querySelector(`[data-day="${businessDate}"][data-today="true"]`)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect((container.querySelector('[name="paymentDate"]') as HTMLInputElement).value).toBe(businessDate);
  });

  it("round trips an editable backdated year-end payment without changing the calendar day", () => {
    const onValueChange = vi.fn();
    const { container } = render(<DatePickerField ariaLabel="Payment date" defaultValue="2026-12-31" name="paymentDate" onValueChange={onValueChange} />);
    expect(screen.getByRole("button", { name: "Payment date" }).textContent).toContain("31 Dec 2026");
    openCalendar("Payment date");
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    fireEvent.click(screen.getByRole("grid").querySelector('[data-day="2025-12-31"] button')!);
    expect(onValueChange).toHaveBeenLastCalledWith("2025-12-31");
    expect(new FormData(Object.assign(document.createElement("form"), { innerHTML: container.innerHTML })).get("paymentDate")).toBe("2025-12-31");
  });

  it("does not let Today bypass a future minimum date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T17:00:00Z"));
    render(<BusinessDateProvider businessDate="2027-01-01" timeZone="Asia/Phnom_Penh"><DatePickerField ariaLabel="End date" name="endDate" minValue="2027-01-02" /></BusinessDateProvider>);
    openCalendar("End date");
    expect((screen.getByRole("button", { name: "Today" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps neighbouring-month days out of reach", () => {
    render(
      <DatePickerField
        ariaLabel="Registered date"
        defaultValue="2026-08-18"
        name="registeredDate"
      />,
    );
    openCalendar("Registered date");

    const selectable = selectableDays();

    expect(selectable).toHaveLength(31);
    expect(
      selectable.every((cell) =>
        cell.getAttribute("data-day")?.startsWith("2026-08"),
      ),
    ).toBe(true);
  });

  it("refuses days before the supplied minimum", () => {
    render(
      <DatePickerField
        ariaLabel="End date"
        defaultValue="2026-08-20"
        minValue="2026-08-10"
        name="leaseEndDate"
      />,
    );
    openCalendar("End date");

    const selectable = selectableDays().map((cell) =>
      cell.getAttribute("data-day"),
    );

    expect(selectable).not.toContain("2026-08-09");
    expect(selectable).toContain("2026-08-10");
    expect(selectable).toContain("2026-08-31");
  });

  it("offers year navigation alongside month navigation", () => {
    render(
      <DatePickerField
        ariaLabel="Start date"
        defaultValue="2026-08-18"
        name="leaseStartDate"
      />,
    );
    openCalendar("Start date");

    expect(screen.getByRole("button", { name: "Previous year" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next year" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next year" }));

    expect(screen.getAllByText("August 2027").length).toBeGreaterThan(0);
  });
});
