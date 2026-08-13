/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditDetails } from "@/components/ui/audit-details";

describe("AuditDetails", () => {
  it("keeps labeled technical values in a closed disclosure", () => {
    const { container } = render(
      <AuditDetails
        entries={[
          { label: "Input hash", value: "abc123" },
          { label: "Source code", value: null },
        ]}
      />,
    );

    expect(screen.getByText("Audit details")).toBeTruthy();
    expect(screen.getByText("Input hash")).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.queryByText("Source code")).toBeNull();
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });
});
