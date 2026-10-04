/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table } from "@/components/ui/table";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Table scroll region", () => {
  it("exposes an opt-in named keyboard-focusable scroll region", () => {
    render(
      <Table scrollRegionLabel="Property account activity">
        <tbody>
          <tr>
            <td>Rent</td>
          </tr>
        </tbody>
      </Table>,
    );

    const region = screen.getByRole("region", {
      name: "Property account activity",
    });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.querySelector("table")).not.toBeNull();
  });

  it("offers first/last column controls only when the table overflows", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(800);
    render(<Table scrollRegionLabel="Accounts"><tbody><tr><td>£1,250.00</td></tr></tbody></Table>);
    const region = screen.getByRole("region", { name: "Accounts" });
    const scrollTo = vi.fn(({ left }: { left: number }) => { region.scrollLeft = left; });
    Object.defineProperty(region, "scrollTo", { value: scrollTo });
    const first = screen.getByRole("button", { name: "Show first columns of Accounts" });
    const last = screen.getByRole("button", { name: "Show last columns of Accounts" });
    expect(first.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(first);
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(last);
    fireEvent.scroll(region);
    expect(scrollTo).toHaveBeenCalledWith({ left: 800, behavior: "auto" });
    expect(last.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(first);
    fireEvent.scroll(region);
    expect(region.scrollLeft).toBe(0);
    expect(first.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps the full table available alongside an opt-in mobile composition", () => {
    render(<Table mobileContent={<p>Riverside House — £1,250.00</p>}><tbody><tr><td>INV-104</td></tr></tbody></Table>);
    expect(screen.getByText("Riverside House — £1,250.00")).not.toBeNull();
    expect(screen.queryByText("More columns — scroll to see the full table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View all columns" }));
    expect(screen.queryByText("Riverside House — £1,250.00")).toBeNull();
    expect(screen.getByText("INV-104")).not.toBeNull();
    const toggle = screen.getByRole("button", { name: "Use compact view" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.getByText("Riverside House — £1,250.00")).not.toBeNull();
  });

  it("preserves the direct scroll-container child used by report height constraints", () => {
    const { container } = render(<section><Table><tbody><tr><td>Balance</td></tr></tbody></Table></section>);
    expect(container.querySelector("section > [data-slot=table-container] > table")).not.toBeNull();
  });
});
