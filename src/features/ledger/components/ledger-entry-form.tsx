"use client";

import { useActionState, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  createLedgerEntryAction,
  type LedgerActionState,
} from "@/features/ledger/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  LedgerPropertyOption,
  LedgerUnitOption,
} from "@/features/ledger/ledger.types";

const initialState: LedgerActionState = {};

type LedgerEntryFormProps = {
  onClose: () => void;
  properties: LedgerPropertyOption[];
  units: LedgerUnitOption[];
};

export function LedgerEntryForm({
  onClose,
  properties,
  units,
}: LedgerEntryFormProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [state, action, pending] = useActionState(
    createLedgerEntryAction,
    initialState,
  );
  const availableUnits = useMemo(
    () => units.filter((unit) => unit.propertyId === selectedPropertyId),
    [selectedPropertyId, units],
  );

  return (
    <form
      action={action}
      className="border-b border-border bg-surface px-8 py-5"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold tracking-tight">Add ledger entry</h2>
        <Button aria-label="Close form" onClick={onClose} type="button" variant="ghost">
          <X size={16} />
        </Button>
      </div>

      {state.message ? (
        <p
          className="mb-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            name="propertyId"
            onChange={(event) => {
              setSelectedPropertyId(event.target.value);
              setSelectedUnitId("");
            }}
            required
            value={selectedPropertyId}
          >
            <option value="">Select property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            disabled={!selectedPropertyId}
            name="unitId"
            onChange={(event) => setSelectedUnitId(event.target.value)}
            value={selectedUnitId}
          >
            <option value="">Property level</option>
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Direction" error={state.fieldErrors?.direction?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            name="direction"
            required
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </Field>

        <Field
          label="Transaction date"
          error={state.fieldErrors?.transactionDate?.[0]}
        >
          <Input name="transactionDate" required type="date" />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_160px_120px] gap-4">
        <Field label="Category" error={state.fieldErrors?.category?.[0]}>
          <Input
            name="category"
            placeholder="Rent, maintenance, utilities"
            required
            type="text"
          />
        </Field>

        <Field label="Amount" error={state.fieldErrors?.amount?.[0]}>
          <Input
            min="0.01"
            name="amount"
            placeholder="0.00"
            required
            step="0.01"
            type="number"
          />
        </Field>

        <Field label="Currency" error={state.fieldErrors?.currency?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            name="currency"
            required
          >
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </select>
        </Field>
      </div>

      <Field
        className="mt-4"
        label="Description"
        error={state.fieldErrors?.description?.[0]}
      >
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
          name="description"
          placeholder="Payment source, invoice reference, or operational notes"
        />
      </Field>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose} type="button">
          Cancel
        </Button>
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? "Adding..." : "Add entry"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  children,
  className,
  error,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  label: string;
}) {
  return (
    <label
      className={
        className ? `block text-sm font-medium ${className}` : "block text-sm font-medium"
      }
    >
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}
