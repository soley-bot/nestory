"use client";

import { useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LedgerEntryForm } from "@/features/ledger/components/ledger-entry-form";
import { LedgerFilters } from "@/features/ledger/components/ledger-filters";
import { LedgerSummary } from "@/features/ledger/components/ledger-summary";
import { LedgerTable } from "@/features/ledger/components/ledger-table";
import { filterLedgerEntries } from "@/features/ledger/ledger.filters";
import type {
  LedgerEntry,
  LedgerPropertyOption,
  LedgerSnapshot,
  LedgerUnitOption,
} from "@/features/ledger/ledger.types";

type LedgerScreenProps = {
  entries: LedgerEntry[];
  propertyOptions: LedgerPropertyOption[];
  snapshot: LedgerSnapshot;
  unitOptions: LedgerUnitOption[];
};

export function LedgerScreen({
  entries,
  propertyOptions,
  snapshot,
  unitOptions,
}: LedgerScreenProps) {
  const [direction, setDirection] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [property, setProperty] = useState("all");
  const [query, setQuery] = useState("");

  const filteredEntries = useMemo(() => {
    return filterLedgerEntries(entries, {
      direction,
      propertyId: property,
      query,
    });
  }, [direction, entries, property, query]);

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <>
            <Button>
              <Download size={15} />
              Export
            </Button>
            <Button onClick={() => setIsFormOpen(true)} variant="primary">
              <Plus size={15} />
              Add entry
            </Button>
          </>
        }
        description="Record income and expenses against properties and units while keeping the timeline in sync."
        title="Financial Ledger"
      />

      {isFormOpen ? (
        <LedgerEntryForm
          onClose={() => setIsFormOpen(false)}
          properties={propertyOptions}
          units={unitOptions}
        />
      ) : null}

      <LedgerFilters
        direction={direction}
        onDirectionChange={setDirection}
        onPropertyChange={setProperty}
        onQueryChange={setQuery}
        properties={propertyOptions}
        property={property}
        query={query}
      />

      <div className="space-y-5 p-8">
        <LedgerSummary snapshot={snapshot} />
        <LedgerTable entries={filteredEntries} />
      </div>
    </div>
  );
}
