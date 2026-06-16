import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { LedgerPropertyOption } from "@/features/ledger/ledger.types";

type LedgerFiltersProps = {
  direction: string;
  onDirectionChange: (value: string) => void;
  onPropertyChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  properties: LedgerPropertyOption[];
  property: string;
  query: string;
};

export function LedgerFilters({
  direction,
  onDirectionChange,
  onPropertyChange,
  onQueryChange,
  properties,
  property,
  query,
}: LedgerFiltersProps) {
  return (
    <div className="border-b border-border bg-surface px-8 py-4">
      <div className="grid grid-cols-[minmax(260px,1fr)_220px_180px] gap-3">
        <label className="relative block">
          <span className="sr-only">Search ledger entries</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            size={16}
          />
          <Input
            className="pl-9"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search category, property, unit, or notes"
            type="search"
            value={query}
          />
        </label>

        <label>
          <span className="sr-only">Filter by property</span>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            onChange={(event) => onPropertyChange(event.target.value)}
            value={property}
          >
            <option value="all">All properties</option>
            {properties.map((propertyOption) => (
              <option key={propertyOption.id} value={propertyOption.id}>
                {propertyOption.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Filter by direction</span>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            onChange={(event) => onDirectionChange(event.target.value)}
            value={direction}
          >
            <option value="all">All directions</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
      </div>
    </div>
  );
}
