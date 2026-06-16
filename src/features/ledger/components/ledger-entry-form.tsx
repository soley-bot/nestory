"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createLedgerEntryAction,
  type LedgerActionState,
  updateLedgerEntryAction,
} from "@/features/ledger/actions";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import type {
  LedgerEntry,
  LedgerPropertyOption,
  LedgerUnitOption,
} from "@/features/ledger/ledger.types";

const initialState: LedgerActionState = {};

type LedgerEntryFormProps = {
  entry?: LedgerEntry;
  mode?: "add" | "edit";
  onClose: () => void;
  onSuccess?: (message: string) => void;
  properties: LedgerPropertyOption[];
  units: LedgerUnitOption[];
};

export function LedgerEntryForm({
  entry,
  mode = "add",
  onClose,
  onSuccess,
  properties,
  units,
}: LedgerEntryFormProps) {
  const isEditMode = mode === "edit";
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    entry?.propertyId ?? "",
  );
  const [selectedUnitId, setSelectedUnitId] = useState(entry?.unitId ?? "");
  const [state, action, pending] = useActionState(
    isEditMode ? updateLedgerEntryAction : createLedgerEntryAction,
    initialState,
  );
  const availableUnits = useMemo(
    () => units.filter((unit) => unit.propertyId === selectedPropertyId),
    [selectedPropertyId, units],
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Ledger entry saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}

        {isEditMode && entry ? (
          <input name="entryId" type="hidden" value={entry.id} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
            <SelectControl
              ariaLabel="Property"
              name="propertyId"
              onValueChange={(value) => {
                setSelectedPropertyId(value);
                setSelectedUnitId("");
              }}
              options={[
                { label: "Select property", value: "" },
                ...properties.map((property) => ({
                  label: property.label,
                  value: property.id,
                })),
              ]}
              required
              value={selectedPropertyId}
            />
          </Field>

          <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
            <SelectControl
              ariaLabel="Unit"
              disabled={!selectedPropertyId}
              name="unitId"
              onValueChange={setSelectedUnitId}
              options={[
                { label: "Property level", value: "" },
                ...availableUnits.map((unit) => ({
                  label: unit.label,
                  value: unit.id,
                })),
              ]}
              value={selectedUnitId}
            />
          </Field>

          <Field label="Direction" error={state.fieldErrors?.direction?.[0]}>
            <SelectControl
              ariaLabel="Direction"
              defaultValue={entry?.direction ?? "income"}
              name="direction"
              options={[
                { label: "Income", value: "income" },
                { label: "Expense", value: "expense" },
              ]}
              required
            />
          </Field>

          <Field
            label="Transaction date"
            error={state.fieldErrors?.transactionDate?.[0]}
          >
            <DatePickerField
              ariaLabel="Transaction date"
              defaultValue={entry?.transactionDate}
              name="transactionDate"
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_100px]">
          <Field label="Category" error={state.fieldErrors?.category?.[0]}>
            <Input
              defaultValue={entry?.category}
              name="category"
              placeholder="Rent, maintenance, utilities"
              required
              type="text"
            />
          </Field>

          <Field label="Amount" error={state.fieldErrors?.amount?.[0]}>
            <Input
              defaultValue={entry?.amount}
              min="0.01"
              name="amount"
              placeholder="0.00"
              required
              step="0.01"
              type="number"
            />
          </Field>

          <Field label="Currency" error={state.fieldErrors?.currency?.[0]}>
            <SelectControl
              ariaLabel="Currency"
              defaultValue={entry?.currency ?? "USD"}
              name="currency"
              options={[
                { label: "USD", value: "USD" },
                { label: "KHR", value: "KHR" },
              ]}
              required
            />
          </Field>
        </div>

        <Field
          className="mt-4"
          label="Description"
          error={state.fieldErrors?.description?.[0]}
        >
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
            defaultValue={entry?.description ?? ""}
            name="description"
            placeholder="Payment source, invoice reference, or operational notes"
          />
        </Field>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant="primary"
          >
            {isEditMode
              ? pending
                ? "Saving..."
                : "Save changes"
              : pending
                ? "Adding..."
                : "Add entry"}
          </Button>
        </div>
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
        className
          ? `block min-w-0 text-sm font-medium ${className}`
          : "block min-w-0 text-sm font-medium"
      }
    >
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}
