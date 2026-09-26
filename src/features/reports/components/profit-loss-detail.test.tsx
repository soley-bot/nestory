// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfitLossDetail } from "./profit-loss-detail";

describe("P&L template", () => {
  it("shows grouped sections, one amount column, and owner funding below operating profit", () => {
    render(<ProfitLossDetail lines={[]} funding={{ contributionCents: BigInt(68200), remainingBalanceCents: -BigInt(9300) }} />);
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeTruthy();
    expect(screen.getByText("Owner Contribution")).toBeTruthy();
    expect(screen.getByText("Remaining Balance")).toBeTruthy();
    expect(screen.getByText("USD 589.00")).toBeTruthy();
    expect(screen.getByText("Net operating income")).toBeTruthy();
  });
});
