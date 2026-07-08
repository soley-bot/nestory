/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { MonthPickerField } from "@/components/ui/month-picker-field";

describe("native date fields", () => {
  it("uses native date validation for required dates", () => {
    render(<DatePickerField ariaLabel="Due date" name="dueDate" required />);

    const input = screen.getByLabelText<HTMLInputElement>("Due date");

    expect(input.type).toBe("date");
    expect(input.required).toBe(true);
    expect(input.willValidate).toBe(true);
  });

  it("uses native month inputs and keeps filter callbacks", () => {
    const onValueChange = vi.fn();

    render(
      <MonthPickerField
        ariaLabel="Report month"
        name="month"
        onValueChange={onValueChange}
        required
      />,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Report month");
    fireEvent.input(input, { target: { value: "2026-07" } });

    expect(input.type).toBe("month");
    expect(input.required).toBe(true);
    expect(input.willValidate).toBe(true);
    expect(onValueChange).toHaveBeenCalledWith("2026-07");
  });
});
