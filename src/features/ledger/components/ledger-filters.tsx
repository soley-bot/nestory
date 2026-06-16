import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import type { LedgerPropertyOption } from "@/features/ledger/ledger.types";

type ArchiveState = "active" | "archived" | "all";

type LedgerFiltersProps = {
  archiveState: ArchiveState;
  direction: string;
  onArchiveStateChange: (value: ArchiveState) => void;
  onDirectionChange: (value: string) => void;
  onPropertyChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  properties: LedgerPropertyOption[];
  property: string;
  query: string;
};

export function LedgerFilters({
  archiveState,
  direction,
  onArchiveStateChange,
  onDirectionChange,
  onPropertyChange,
  onQueryChange,
  properties,
  property,
  query,
}: LedgerFiltersProps) {
  return (
    <div className="border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(180px,240px)_minmax(150px,180px)_minmax(130px,160px)]">
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
          <SelectControl
            ariaLabel="Filter by property"
            onValueChange={onPropertyChange}
            options={[
              { label: "All properties", value: "all" },
              ...properties.map((propertyOption) => ({
                label: propertyOption.label,
                value: propertyOption.id,
              })),
            ]}
            value={property}
          />
        </label>

        <label>
          <span className="sr-only">Filter by direction</span>
          <SelectControl
            ariaLabel="Filter by direction"
            onValueChange={onDirectionChange}
            options={[
              { label: "All directions", value: "all" },
              { label: "Income", value: "income" },
              { label: "Expense", value: "expense" },
            ]}
            value={direction}
          />
        </label>

        <label>
          <span className="sr-only">Filter by archive state</span>
          <SelectControl
            ariaLabel="Filter by archive state"
            onValueChange={(value) =>
              onArchiveStateChange(value as ArchiveState)
            }
            options={[
              { label: "Active", value: "active" },
              { label: "Archived", value: "archived" },
              { label: "All records", value: "all" },
            ]}
            value={archiveState}
          />
        </label>
      </div>
    </div>
  );
}
