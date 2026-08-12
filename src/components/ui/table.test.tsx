/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table } from "@/components/ui/table";

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
});
