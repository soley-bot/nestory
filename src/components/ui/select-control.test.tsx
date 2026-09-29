// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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
