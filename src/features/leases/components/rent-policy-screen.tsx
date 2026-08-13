"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import {
  approveRentPolicyVersionAction,
  createRentPolicyDraftAction,
  type RentPolicyActionState,
  updateRentPolicyDraftAction,
} from "@/features/leases/actions";
import type { RentPolicyVersion } from "@/features/leases/data/rent-policy";

const initialState: RentPolicyActionState = {};
const frequencyOptions = [
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["semi_annual", "Semi-annual"],
  ["annual", "Annual"],
  ["one_time", "One time"],
] as const;

type RentPolicyScreenProps = {
  versions: RentPolicyVersion[];
};

export function RentPolicyScreen({ versions }: RentPolicyScreenProps) {
  const draft = versions.find((version) => version.lifecycle === "draft");
  const approved = versions.filter(
    (version) => version.lifecycle === "approved",
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Rent policy</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Drafts may remain unresolved. Approval is blocked until every
              due-day, proration, notice, frequency, concession, rent-free,
              and waiver rule is explicit.
            </p>
          </div>
          <Badge tone={draft ? "warning" : approved.length ? "success" : "danger"}>
            {draft
              ? "Draft unresolved"
              : approved.length
                ? "Approved version available"
                : "No approved policy"}
          </Badge>
        </div>
      </section>

      {draft ? <DraftPolicyForm draft={draft} /> : <CreateDraftForm />}

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Version history</h2>
        <div
          aria-label="Rent policy version history"
          className="mt-3 overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          tabIndex={0}
        >
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-border bg-[var(--table-header-bg)] text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Effective</th>
              <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Frequencies</th>
                <th className="py-2">Timezone</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr className="border-b border-border/70" key={version.id}>
                  <td className="py-2 pr-4">v{version.version_number}</td>
                  <td className="py-2 pr-4">{version.effective_from}</td>
                  <td className="py-2 pr-4">
                    <Badge
                      tone={
                        version.lifecycle === "approved"
                          ? "success"
                          : version.lifecycle === "draft"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {version.lifecycle === "approved" ? "Approved" : version.lifecycle === "draft" ? "Draft" : "Archived"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {version.supported_frequencies?.join(", ") ??
                      "Unresolved"}
                  </td>
                  <td className="py-2">
                    {version.rent_calculation_timezone ?? "Unresolved"}
                  </td>
                </tr>
              ))}
              {versions.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={5}>
                    No policy versions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CreateDraftForm() {
  const [state, action, pending] = useActionState(
    createRentPolicyDraftAction,
    initialState,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <form
      action={action}
      className="rounded-md border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold">Create policy draft</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        This creates an empty version. It does not invent a due day or
        proration rule.
      </p>
      <input
        name="idempotencyKey"
        suppressHydrationWarning
        type="hidden"
        value={idempotencyKey}
      />
      <label className="mt-4 grid max-w-xs gap-1 text-sm font-medium">
        <span>Effective from</span>
        <DatePickerField
          ariaLabel="Policy effective date"
          name="effectiveFrom"
          required
        />
      </label>
      <Button className="mt-4" disabled={pending} type="submit">
        {pending ? "Creating..." : "Create draft"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

function DraftPolicyForm({ draft }: { draft: RentPolicyVersion }) {
  const [dueDaySource, setDueDaySource] = useState(
    draft.due_day_source ?? "",
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateRentPolicyDraftAction,
    initialState,
  );
  const [approveState, approveAction, approvePending] = useActionState(
    approveRentPolicyVersionAction,
    initialState,
  );

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Draft v{draft.version_number}
          </h2>
          <p className="text-xs text-muted-foreground">
            Effective {draft.effective_from}
          </p>
        </div>
        <Badge tone="warning">Not approved</Badge>
      </div>

      <form action={updateAction} className="mt-4 space-y-5">
        <input name="policyId" type="hidden" value={draft.id} />

        <fieldset>
          <legend className="text-sm font-medium">
            Supported frequencies
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {frequencyOptions.map(([value, label]) => (
              <label className="flex items-center gap-2 text-sm" key={value}>
                <input
                  defaultChecked={draft.supported_frequencies?.includes(value)}
                  name="supportedFrequencies"
                  type="checkbox"
                  value={value}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <PolicyField label="Calculation timezone">
            <Input
              defaultValue={draft.rent_calculation_timezone ?? ""}
              name="rentCalculationTimezone"
              placeholder="Asia/Bangkok"
              required
            />
          </PolicyField>
          <PolicySelect
            defaultValue={draft.due_day_source}
            label="Due-day source"
            name="dueDaySource"
            onValueChange={setDueDaySource}
            options={[
              ["term", "Lease term"],
              ["policy_default", "Policy default"],
            ]}
          />
          {dueDaySource === "policy_default" ? (
            <PolicyField label="Policy default due day">
              <NumberInput
                defaultValue={draft.policy_default_due_day ?? ""}
                max="31"
                min="1"
                name="policyDefaultDueDay"
                required
              />
            </PolicyField>
          ) : null}
          <PolicySelect
            defaultValue={draft.short_month_due_day_rule}
            label="Short-month due day"
            name="shortMonthDueDayRule"
            options={[
              ["last_calendar_day", "Use last calendar day"],
              ["next_calendar_month", "Move to next calendar month"],
            ]}
          />
          <PolicySelect
            defaultValue={draft.lease_start_proration_rule}
            label="Lease-start proration"
            name="leaseStartProrationRule"
            options={[
              ["actual_days", "Actual days"],
              ["thirty_day", "30-day basis"],
              ["no_proration", "No proration"],
            ]}
          />
          <PolicySelect
            defaultValue={draft.lease_end_proration_rule}
            label="Lease-end proration"
            name="leaseEndProrationRule"
            options={[
              ["actual_days", "Actual days"],
              ["thirty_day", "30-day basis"],
              ["no_proration", "No proration"],
              ["through_move_out", "Charge through move-out"],
            ]}
          />
          <PolicySelect
            defaultValue={draft.notice_period_charging_rule}
            label="Notice-period charging"
            name="noticePeriodChargingRule"
            options={[
              ["through_lease_end", "Charge through lease end"],
              ["through_move_out", "Charge through move-out"],
              ["stop_on_notice", "Stop on notice"],
            ]}
          />
          <PolicySelect
            defaultValue={draft.mid_period_rent_change_rule}
            label="Mid-period rent change"
            name="midPeriodRentChangeRule"
            options={[
              ["prorate_actual_days", "Prorate actual days"],
              ["prorate_thirty_day", "Prorate on 30-day basis"],
              ["next_full_period", "Apply next full period"],
            ]}
          />
          <SupportSelect
            defaultValue={draft.concessions_support_state}
            label="Concessions"
            name="concessionsSupportState"
          />
          <SupportSelect
            defaultValue={draft.rent_free_support_state}
            label="Rent-free periods"
            name="rentFreeSupportState"
          />
          <SupportSelect
            defaultValue={draft.waivers_support_state}
            label="Waivers"
            name="waiversSupportState"
          />
        </div>

        <Button disabled={updatePending} type="submit">
          {updatePending ? "Saving..." : "Save explicit rules"}
        </Button>
        <ActionMessage state={updateState} />
      </form>

      <form action={approveAction} className="mt-5 border-t border-border pt-4">
        <input name="policyId" type="hidden" value={draft.id} />
        <p className="text-xs text-muted-foreground">
          Approval makes these economic rules immutable. Corrections require a
          later version.
        </p>
        <Button className="mt-3" disabled={approvePending} type="submit">
          {approvePending ? "Approving..." : "Approve immutable version"}
        </Button>
        <ActionMessage state={approveState} />
      </form>
    </section>
  );
}

function PolicyField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PolicySelect({
  defaultValue,
  label,
  name,
  onValueChange,
  options,
}: {
  defaultValue: string | null;
  label: string;
  name: string;
  onValueChange?: (value: string) => void;
  options: Array<readonly [string, string]>;
}) {
  return (
    <PolicyField label={label}>
      <SelectControl
        ariaLabel={label}
        defaultValue={defaultValue ?? ""}
        name={name}
        onValueChange={onValueChange}
        options={[
          { label: "Resolve this rule", value: "" },
          ...options.map(([value, optionLabel]) => ({
            label: optionLabel,
            value,
          })),
        ]}
        required
      />
    </PolicyField>
  );
}

function SupportSelect({
  defaultValue,
  label,
  name,
}: {
  defaultValue: string | null;
  label: string;
  name: string;
}) {
  return (
    <PolicySelect
      defaultValue={defaultValue}
      label={label}
      name={name}
      options={[
        ["supported", "Supported"],
        ["unsupported", "Not supported"],
      ]}
    />
  );
}

function ActionMessage({ state }: { state: RentPolicyActionState }) {
  return state.message ? (
    <p
      className={`mt-3 text-sm ${
        state.status === "error" ? "text-danger" : "text-success"
      }`}
      role="status"
    >
      {state.message}
    </p>
  ) : null;
}
