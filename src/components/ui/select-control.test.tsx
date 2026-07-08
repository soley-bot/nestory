/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectControl } from "@/components/ui/select-control";

describe("SelectControl", () => {
  it("uses native required validation", () => {
    render(
      <SelectControl
        ariaLabel="Property"
        name="propertyId"
        options={[{ label: "Central", value: "property-1" }]}
        placeholder="Choose property"
        required
      />,
    );

    const select = screen.getByLabelText<HTMLSelectElement>("Property");

    expect(select.required).toBe(true);
    expect(select.willValidate).toBe(true);
    expect(select.value).toBe("");
    expect(select.checkValidity()).toBe(false);
  });

  it("submits real empty values for optional empty options", () => {
    render(
      <form data-testid="form">
        <SelectControl
          ariaLabel="Unit"
          name="unitId"
          options={[
            { label: "No unit", value: "" },
            { label: "Unit 1", value: "unit-1" },
          ]}
        />
      </form>,
    );

    const form = screen.getByTestId("form") as HTMLFormElement;

    expect(new FormData(form).get("unitId")).toBe("");
  });

  it("notifies callers when the value changes", () => {
    const onValueChange = vi.fn();

    render(
      <SelectControl
        ariaLabel="Status"
        onValueChange={onValueChange}
        options={[
          { label: "Open", value: "open" },
          { label: "Closed", value: "closed" },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "closed" },
    });

    expect(onValueChange).toHaveBeenCalledWith("closed");
  });
});
