/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxControl } from "@/components/ui/checkbox-control";

describe("CheckboxControl", () => {
  it("submits checked values through native form behavior", () => {
    render(
      <form data-testid="form">
        <CheckboxControl defaultChecked name="roles" value="tenant" />
      </form>,
    );

    const form = screen.getByTestId("form") as HTMLFormElement;

    expect(new FormData(form).get("roles")).toBe("tenant");
  });

  it("supports required checkbox validation", () => {
    render(<CheckboxControl aria-label="Accept" required />);

    const checkbox = screen.getByLabelText<HTMLInputElement>("Accept");

    expect(checkbox.required).toBe(true);
    expect(checkbox.willValidate).toBe(true);
    expect(checkbox.checkValidity()).toBe(false);
  });

  it("notifies callers with checked state", () => {
    const onCheckedChange = vi.fn();

    render(
      <CheckboxControl
        aria-label="Complete"
        onCheckedChange={onCheckedChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Complete"));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
