/* @vitest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatePickerField } from "@/components/ui/date-picker-field";

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
