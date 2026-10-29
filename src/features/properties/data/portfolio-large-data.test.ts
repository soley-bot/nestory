import { expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createCappedReadHarness } from "./financial-capped-read.test-fixture";
import { getPropertiesScreenData } from "./properties";
import { getUnitsScreenData } from "@/features/units/data/units";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { parseUnitSearchParams } from "@/features/units/unit.filters";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
const organizationId = "synthetic-org";
const scope = { organization_id: organizationId, archived_at: null };
const property = { ...scope, id: "property-1", code: "P1", name: "Property", property_type: "Apartment", status: "active", owner: null, address: null };
const id = (i: number) => "unit-" + String(i).padStart(6, "0");

it("does not materialize a 5000-property portfolio for a search with no matches", async () => {
  const harness = createCappedReadHarness({ properties: Array.from({ length: 5000 }, (_, i) => ({ ...property, id: "property-" + i })) });
  const rpc = vi.fn(async (name: string) => name === "get_property_register_page"
    ? { data: { ids: [], total_count: 0 }, error: null }
    : harness.client.rpc(name));
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ ...harness.client, rpc } as never);
  const result = await getPropertiesScreenData(organizationId, parsePropertySearchParams({ query: "absentneedle" }));
  expect(result.properties).toEqual([]);
  expect(harness.reads.reduce((total, read) => total + (read.returnedRows ?? 0), 0)).toBe(0);
  expect(rpc).toHaveBeenCalledWith("get_property_register_page", expect.objectContaining({ p_organization_id: organizationId, p_page_size: 10 }));
});

it("hydrates only the selected ten units when sorting 5000 units by rent", async () => {
  const units = Array.from({ length: 5000 }, (_, i) => ({ ...scope, id: id(i), property_id: property.id, unit_number: String(i), status: "vacant", current_rent_amount: i, current_rent_currency: "USD", floor: null, size_sqm: null, bedroom_count: null, bathroom_count: null }));
  const selected = units.slice(-10).reverse().map(row => row.id);
  const harness = createCappedReadHarness({ properties: [property], units });
  const rpc = vi.fn(async (name: string) => name === "get_unit_register_page"
    ? { data: { ids: selected, total_count: 5000 }, error: null }
    : name === "get_portfolio_ledger_totals" ? { data: [], error: null }
    : harness.client.rpc(name));
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ ...harness.client, rpc } as never);
  const result = await getUnitsScreenData(organizationId, parseUnitSearchParams({ sort: "rent_desc" }));
  expect(result.units.map(row => row.id)).toEqual(selected);
  expect(result.pagination.totalCount).toBe(5000);
  expect(harness.reads.filter(read => read.table === "units").reduce((total, read) => total + (read.returnedRows ?? 0), 0)).toBe(10);
});

it("calculates the total for 100001 ledger entries without downloading history", async () => {
  const ledger_entries = Array.from({ length: 100001 }, (_, i) => ({ ...scope, id: "ledger-" + i, property_id: property.id, unit_id: null, amount: 1, currency: "USD", direction: "income" }));
  const harness = createCappedReadHarness({ properties: [property], ledger_entries });
  const rpc = vi.fn(async (name: string) => name === "get_portfolio_ledger_totals"
    ? { data: [{ scope_type: "property", scope_id: property.id, amount: 100001, currency: "USD", direction: "income", category: "", transaction_date: "0001-01-01", entry_count: 100001 }], error: null }
    : harness.client.rpc(name));
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ ...harness.client, rpc } as never);
  const result = await getPropertiesScreenData(organizationId);
  expect(result.properties[0].netIncomeUsd).toBe(100001);
  expect(harness.reads.filter(read => read.table === "ledger_entries")).toHaveLength(0);
  expect(rpc).toHaveBeenCalledWith("get_portfolio_ledger_totals", expect.objectContaining({ p_organization_id: organizationId, p_property_ids: [property.id] }));
});
