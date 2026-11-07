/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnitProfitLossSelector } from "./unit-profit-loss-selector";
import type { ReportsViewQuery, ReportUnitOption } from "../reports.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);
const viewQuery: ReportsViewQuery = { month: "2026-11", propertyId: "property-1", unitId: "all", report: "unit-profit-loss", ownerPersonId: "all", peopleArchiveState: "active", peopleView: "relationship", status: "all" };
const units: ReportUnitOption[] = [
  { id: "unit-1", label: "Example / Unit A1", propertyId: "property-1" },
  { id: "unit-2", label: "Example / Unit A2", propertyId: "property-1" },
  { id: "unit-other", label: "Other / Unit A1", propertyId: "property-other" },
];

describe("separate unit report selection", () => {
  it("offers two independent previews and one bundle containing only the chosen property's units", async () => {
    render(<UnitProfitLossSelector unitOptions={units} viewQuery={viewQuery} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "View P&L for Example / Unit A1" }).getAttribute("href")).toContain("propertyId=property-1&unitId=unit-1");
    const url = new URL(screen.getByRole("link", { name: "Download PDFs" }).getAttribute("href")!, "http://localhost");
    expect(url.searchParams.getAll("unitIds")).toEqual(["unit-1", "unit-2"]);
    expect(url.searchParams.get("month")).toBe("2026-11");
    await userEvent.click(screen.getByRole("checkbox", { name: "Example / Unit A1" }));
    expect(screen.getByRole("link", { name: "Download Excel files" }).getAttribute("href")).not.toContain("unitIds=unit-1");
    await userEvent.click(screen.getByRole("checkbox", { name: "Example / Unit A2" }));
    expect((screen.getByRole("button", { name: "Download PDFs" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps selection explicit across search and limits large lists to twenty per download", async () => {
    const many = Array.from({ length: 45 }, (_, index) => ({ id: `unit-${index}`, label: `Example / Unit ${index + 1}`, propertyId: "property-1" }));
    render(<UnitProfitLossSelector unitOptions={many} viewQuery={viewQuery} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(20);
    await userEvent.click(screen.getByRole("button", { name: "Select shown" }));
    expect(screen.getByText("20 selected · Up to 20 reports per download")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Next units" }));
    expect(screen.getAllByRole("checkbox").every(input => (input as HTMLInputElement).disabled)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Find units" }), "Unit 45");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("link", { name: "Download PDFs" }).getAttribute("href")).toContain("unitIds=unit-44");
    expect(screen.getByRole("link", { name: "Download PDFs" }).getAttribute("href")).not.toContain("unitIds=unit-0");
  });
});
