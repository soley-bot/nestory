// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LedgerFilters } from "./ledger-filters";
import { DEFAULT_LEDGER_VIEW_QUERY } from "../ledger.filters";
const navigation = vi.hoisted(() => ({replace: vi.fn()}));
vi.mock("next/navigation", () => ({usePathname: () => "/ledger", useRouter: () => navigation, useSearchParams: () => new URLSearchParams("propertyId=property-a&query=rent&dateFrom=2026-10-01&minAmount=200")}));
afterEach(() => {cleanup(); vi.clearAllMocks();});
it("clears one date restriction while retaining property, search and amount", () => {
  render(<LedgerFilters properties={[]} units={[]} viewQuery={{...DEFAULT_LEDGER_VIEW_QUERY, propertyId: "property-a", query: "rent", dateFrom: "2026-10-01", minAmount: 200}} />);
  expect(screen.getByLabelText("Ledger date from")).toBeTruthy();
  expect(screen.getByLabelText("Ledger minimum amount")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Clear dateFrom filter"}));
  expect(navigation.replace).toHaveBeenCalledWith("/ledger?propertyId=property-a&query=rent&minAmount=200", {scroll: false});
});
