import { createSupabaseServerClient } from "@/lib/db/server";
import { buildLedgerSnapshot } from "@/features/ledger/data/ledger-summary";
import type {
  LedgerEntry,
  LedgerPropertyOption,
  LedgerUnitOption,
} from "@/features/ledger/ledger.types";
import type { CurrencyCode } from "@/lib/money/format";

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type UnitRow = {
  id: string;
  property_id: string;
  unit_number: string;
};

type LedgerEntryRow = {
  amount: number;
  category: string;
  currency: CurrencyCode;
  description: string | null;
  direction: string;
  id: string;
  property_id: string;
  transaction_date: string;
  unit_id: string | null;
};

export async function getLedgerScreenData(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [ledgerResult, propertiesResult, unitsResult] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select(
        "id, property_id, unit_id, transaction_date, direction, category, amount, currency, description",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("transaction_date", { ascending: false })
      .limit(100),
    supabase
      .from("properties")
      .select("id, name, code")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("units")
      .select("id, property_id, unit_number")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
  ]);

  if (ledgerResult.error) {
    throw new Error(`Could not load ledger entries: ${ledgerResult.error.message}`);
  }

  if (propertiesResult.error) {
    throw new Error(`Could not load ledger properties: ${propertiesResult.error.message}`);
  }

  if (unitsResult.error) {
    throw new Error(`Could not load ledger units: ${unitsResult.error.message}`);
  }

  const propertiesById = indexById(propertiesResult.data ?? []);
  const unitsById = indexById(unitsResult.data ?? []);
  const entries = (ledgerResult.data ?? []).map((entry) =>
    toLedgerEntry({
      entry,
      property: propertiesById.get(entry.property_id),
      unit: entry.unit_id ? unitsById.get(entry.unit_id) : undefined,
    }),
  );

  return {
    entries,
    propertyOptions: (propertiesResult.data ?? []).map(
      (property): LedgerPropertyOption => ({
        id: property.id,
        label: `${property.code} - ${property.name}`,
      }),
    ),
    snapshot: buildLedgerSnapshot(ledgerResult.data ?? []),
    unitOptions: (unitsResult.data ?? []).map((unit): LedgerUnitOption => {
      const property = propertiesById.get(unit.property_id);

      return {
        id: unit.id,
        label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
        propertyId: unit.property_id,
      };
    }),
  };
}

function toLedgerEntry({
  entry,
  property,
  unit,
}: {
  entry: LedgerEntryRow;
  property?: PropertyRow;
  unit?: UnitRow;
}): LedgerEntry {
  return {
    amount: entry.amount,
    category: entry.category,
    currency: entry.currency,
    description: entry.description ?? "No description recorded.",
    direction: entry.direction === "expense" ? "expense" : "income",
    id: entry.id,
    propertyCode: property?.code ?? "Unknown",
    propertyId: entry.property_id,
    propertyName: property?.name ?? "Unknown property",
    transactionDate: entry.transaction_date,
    unitNumber: unit?.unit_number,
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}
