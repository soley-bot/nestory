"use client";

import { useActionState, useMemo, useState } from "react";
import { Save } from "lucide-react";
import {
  updateCurrencySettingsAction,
  type CurrencySettingsActionState,
} from "@/features/settings/actions";
import { MoneyDisplay } from "@/components/data/money-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  formatMoneyDisplay,
  normalizeCurrencyDisplaySettings,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";

const initialState: CurrencySettingsActionState = {};

export function CurrencySettingsForm({
  settings,
}: {
  settings: CurrencyDisplaySettings;
}) {
  const normalizedSettings = normalizeCurrencyDisplaySettings(settings);
  const [state, action, pending] = useActionState(
    updateCurrencySettingsAction,
    initialState,
  );
  const [preferredCurrency, setPreferredCurrency] = useState(
    normalizedSettings.preferredCurrency,
  );
  const [khrPerUsd, setKhrPerUsd] = useState(String(normalizedSettings.khrPerUsd));

  const preview = useMemo(
    () =>
      formatMoneyDisplay(850, "USD", {
        khrPerUsd: Number(khrPerUsd),
        preferredCurrency,
      }),
    [khrPerUsd, preferredCurrency],
  );

  return (
    <form action={action} className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold">Currency display</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Choose which currency gets visual priority across financial screens.
        </p>
      </div>

      <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Primary currency"
            error={state.fieldErrors?.preferredCurrency?.[0]}
          >
            <SelectControl
              ariaLabel="Primary currency"
              name="preferredCurrency"
              onValueChange={(value) =>
                setPreferredCurrency(value === "KHR" ? "KHR" : "USD")
              }
              options={[
                { label: "USD", value: "USD" },
                { label: "KHR", value: "KHR" },
              ]}
              required
              value={preferredCurrency}
            />
          </Field>

          <Field label="KHR per USD" error={state.fieldErrors?.khrPerUsd?.[0]}>
            <Input
              inputMode="decimal"
              min="1"
              name="khrPerUsd"
              onChange={(event) => setKhrPerUsd(event.currentTarget.value)}
              placeholder="4100"
              required
              step="0.01"
              type="number"
              value={khrPerUsd}
            />
          </Field>
        </div>

        <div className="rounded-md border border-border bg-surface-muted px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Preview
          </p>
          <div className="mt-2">
            <MoneyDisplay value={preview} size="large" />
          </div>
        </div>
      </div>

      {state.message ? (
        <p
          className="mx-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm sm:mx-5"
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end border-t border-border px-4 py-4 sm:px-5">
        <Button disabled={pending} type="submit" variant="primary">
          <Save size={15} />
          {pending ? "Saving..." : "Save currency settings"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}
