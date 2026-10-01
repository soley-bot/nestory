// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecordField } from "@/components/ui/record-form";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SelectControl } from "@/components/ui/select-control";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

describe("SelectControl", () => {
  it.each([2, 7])("ignores an open option when its fieldset becomes disabled with %i options", async (count) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const renderControl = (disabled: boolean) => <fieldset disabled={disabled}><SelectControl ariaLabel="Category" defaultValue="0" onValueChange={onValueChange} options={Array.from({ length: count }, (_, index) => ({ label: `Category ${index + 1}`, value: String(index) }))} /></fieldset>;
    const { rerender } = render(renderControl(false));
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    rerender(renderControl(true));
    await user.click(screen.getByRole("option", { name: "Category 2" }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Category" }).textContent).toContain("Category 1");
  });

  it.each([2, 7])("preserves the field label, error and value with %i options", async (count) => {
    const user = userEvent.setup();
    render(
      <RecordField error="Choose another category." label="Charge category" name="category" required>
        <SelectControl ariaLabel="Category" defaultValue="0" name="category" options={Array.from({ length: count }, (_, index) => ({ label: `Category ${index + 1}`, value: String(index) }))} />
      </RecordField>,
    );
    const control = screen.getByRole("combobox", { name: /^Charge category\s*\(required\)$/ });
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-required")).toBe("true");
    expect(document.getElementById(control.getAttribute("aria-describedby")!)?.textContent).toBe("Choose another category.");
    expect(control.textContent).toContain("Category 1");
    await user.click(control);
    if (count >= 7) {
      const search = screen.getByRole("combobox", { name: /^Search Charge category\s*\(required\)$/ });
      expect(search.getAttribute("aria-describedby")).toBe(control.getAttribute("aria-describedby"));
    }
    expect(screen.getByRole("option", { name: "Category 1" }).getAttribute("aria-selected")).toBe("true");
  });

  it("returns Tab focus to the trigger for native navigation without changing the selection", async () => {
    const user = userEvent.setup();
    render(<><SelectControl ariaLabel="Category" defaultValue="0" options={Array.from({ length: 7 }, (_, index) => ({ label: `Category ${index + 1}`, value: String(index) }))} /><button>Continue</button></>);
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.type(screen.getByRole("combobox", { name: "Search Category" }), "Category 2");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search Category" }), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Category" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Category" }).textContent).toContain("Category 1");
  });

  it("skips disabled choices during long-list keyboard navigation", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SelectControl ariaLabel="Category" onValueChange={onValueChange} options={Array.from({ length: 7 }, (_, index) => ({ disabled: index === 1, label: `Category ${index + 1}`, value: String(index) }))} />);
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("2");
  });

  it.each([2, 7])("opens and selects with the keyboard with %i options", async (count) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SelectControl ariaLabel="Category" onValueChange={onValueChange} options={Array.from({ length: count }, (_, index) => ({ label: `Category ${index + 1}`, value: String(index) }))} />);
    const control = screen.getByRole("combobox", { name: "Category" });
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).not.toBeNull();
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("0");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(control);
  });

  it("keeps an empty controlled selection controlled when it is filled and cleared", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const options = [{ label: "Operating account", value: "operating" }];
      const { rerender } = render(<SelectControl ariaLabel="Pay from" value="" options={options} placeholder="Choose account" />);
      rerender(<SelectControl ariaLabel="Pay from" value="operating" options={options} placeholder="Choose account" />);
      expect(screen.getByRole("combobox").textContent).toContain("Operating account");
      rerender(<SelectControl ariaLabel="Pay from" value="" options={options} placeholder="Choose account" />);
      expect(screen.getByRole("combobox").textContent).toContain("Choose account");
      expect(warning).not.toHaveBeenCalled();
    } finally { warning.mockRestore(); }
  });
  it("adds search to long option lists and submits the selected value", async () => {
    const user = userEvent.setup();
    render(
      <form aria-label="Charge form">
        <SelectControl
          ariaLabel="Category"
          defaultValue="rental"
          name="categoryAccountId"
          options={[
            { label: "Application fees", value: "application" },
            { label: "Internet", value: "internet" },
            { label: "Late fees", value: "late" },
            { label: "Other income", value: "other" },
            { label: "Parking", value: "parking" },
            { label: "Rental income", value: "rental" },
            { label: "Utilities", value: "utilities" },
          ]}
          required
        />
      </form>,
    );

    await user.click(screen.getByRole("combobox", { name: "Category" }));
    const search = await screen.findByRole("combobox", {
      name: "Search Category",
    });
    await user.type(search, "inter");

    expect(screen.queryByRole("option", { name: "Parking" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Internet" }));

    const form = screen.getByRole("form", { name: "Charge form" });
    expect(
      form.querySelector<HTMLInputElement>('input[name="categoryAccountId"]')
        ?.value,
    ).toBe("internet");
    expect(within(form).getByRole("combobox", { name: "Category" }).textContent).toContain(
      "Internet",
    );
  });
});
