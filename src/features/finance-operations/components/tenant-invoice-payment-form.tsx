"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import {
  confirmOwnerCollectionAction,
  recordTenantInvoicePaymentAction,
} from "@/features/finance-operations/actions";
import type {
  FinanceOperationsActionState,
  FinanceOption,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatMoneyDisplay } from "@/lib/money/format";

export type TenantPaymentReceiptResult = {
  href: string | null;
  paymentId: string | null;
  unavailable: boolean;
};

type TenantInvoicePaymentFormProps = {
  invoice: TenantInvoiceSummary;
  onChooseAnother?: () => void;
  onReceiptResult: (result: TenantPaymentReceiptResult) => void;
  onSuccess: (message: string) => void;
  ownerLabel: string;
  reconciliationSources: FinanceOption[];
  submitLabel?: string;
};

export function TenantInvoicePaymentForm(
  props: TenantInvoicePaymentFormProps,
) {
  return (
    <TenantInvoicePaymentFormStateful
      {...props}
      key={`${props.invoice.id}:${props.invoice.collectionRoute}`}
    />
  );
}

function TenantInvoicePaymentFormStateful({
  invoice,
  onChooseAnother,
  onReceiptResult,
  onSuccess,
  ownerLabel,
  reconciliationSources,
  submitLabel,
}: TenantInvoicePaymentFormProps) {
  const idempotencyKey = useStableActionId(
    invoice.collectionRoute === "through_ips" ? "payment" : "owner-confirm",
  );
  const action =
    invoice.collectionRoute === "through_ips"
      ? recordTenantInvoicePaymentAction
      : confirmOwnerCollectionAction;
  const [state, formAction] = useActionState(action, {});
  const errorId = useId();
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const deliveredSuccessRef = useRef<FinanceOperationsActionState | null>(null);
  const submittedSafeValuesRef = useRef<Map<string, string>>(new Map());
  const sources = reconciliationSources.filter(
    (source) => !source.propertyId || source.propertyId === invoice.propertyId,
  );
  const defaultReceivingSourceId = getDefaultReceivingSourceId(sources);
  const outstandingLines = invoice.lines.filter((line) => line.balanceDue > 0);
  const settlementDateLabel =
    invoice.collectionRoute === "through_ips"
      ? "Received date"
      : "Confirmed date";
  const actionLabel =
    submitLabel ??
    (invoice.collectionRoute === "through_ips"
      ? "Record payment"
      : "Confirm collected");

  useEffect(() => {
    if (state.status !== "error") return;
    restoreSafeUncontrolledValues(
      formRef.current,
      submittedSafeValuesRef.current,
    );
    errorRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (state.status !== "success" || !state.message) return;
    if (deliveredSuccessRef.current === state) return;
    deliveredSuccessRef.current = state;
    if (invoice.collectionRoute === "through_ips") {
      onReceiptResult({
        href: state.artifactHref ?? null,
        paymentId: state.paymentId ?? null,
        unavailable: state.publicationStatus === "failed",
      });
    }
    onSuccess(state.message);
  }, [invoice.collectionRoute, onReceiptResult, onSuccess, state]);

  return (
    <form
      action={formAction}
      aria-describedby={state.status === "error" ? errorId : undefined}
      className="space-y-4 p-4"
      onSubmitCapture={(event) => {
        submittedSafeValuesRef.current = captureSafeUncontrolledValues(
          event.currentTarget,
        );
      }}
      ref={formRef}
    >
      <DefinitionRows
        rows={[
          ["Invoice", invoice.invoiceNumber],
          ["Customer", invoice.recipientLabel],
          ["Balance", formatMoneyDisplay(invoice.balanceDue).primary],
          ...(invoice.collectionRoute === "through_ips"
            ? ([
                [
                  "Applied to",
                  `${ownerLabel} · ${invoice.propertyLabel} — Automatic`,
                ],
              ] satisfies [string, ReactNode][])
            : []),
        ]}
      />
      <input name="invoiceId" type="hidden" value={invoice.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <NumberInput
            defaultValue={invoice.balanceDue}
            name="amount"
            required
          />
        </Field>
        <Field label={settlementDateLabel}>
          <DatePickerField
            ariaLabel={settlementDateLabel}
            defaultValue={getBusinessDateValue()}
            name="settlementDate"
            required
          />
        </Field>
        {invoice.collectionRoute === "through_ips" ? (
          <Field label="Received into">
            <div className="space-y-1.5">
              <SelectControl
                ariaLabel="Received into"
                defaultValue={defaultReceivingSourceId}
                name="reconciliationSourceId"
                options={sources.map((source) => ({
                  label: getReceivingSourceDisplayLabel(source.label),
                  value: source.id,
                }))}
                placeholder="Choose receiving account"
                required
              />
              <p className="text-xs leading-4 text-muted-foreground">
                Where the payment actually arrived.
              </p>
            </div>
          </Field>
        ) : null}
        <Field label="Reference">
          <Input name="reference" placeholder="Optional" />
        </Field>
      </div>
      {outstandingLines.length > 1 ? (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Change how payment is applied
          </summary>
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
            {outstandingLines.map((line) => (
              <Field
                key={line.id}
                label={`${line.label} · ${formatMoneyDisplay(line.balanceDue).primary}`}
              >
                <NumberInput
                  name={`allocation:${line.id}`}
                  placeholder="Leave blank for Rent first"
                />
              </Field>
            ))}
          </div>
        </details>
      ) : null}
      {invoice.collectionRoute === "direct_to_owner" ? (
        <p className="text-xs text-muted-foreground">
          This marks the invoice “Collected by owner” and does not add cash to
          the property account.
        </p>
      ) : null}
      {state.status === "error" && state.message ? (
        <p
          className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
          id={errorId}
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          {state.message}
        </p>
      ) : null}
      <FormFooter>
        {onChooseAnother ? (
          <Button onClick={onChooseAnother}>Choose another</Button>
        ) : (
          <span />
        )}
        <SubmitButton label={actionLabel} />
      </FormFooter>
    </form>
  );
}

function useStableActionId(prefix: string) {
  const [id] = useState(() => `${prefix}-${globalThis.crypto.randomUUID()}`);
  return id;
}

const FINANCE_SOURCE_LABEL_SEPARATOR = " · ";

function getDefaultReceivingSourceId(sources: FinanceOption[]) {
  return sources.length === 1 ? sources[0]?.id : undefined;
}

function getReceivingSourceDisplayLabel(label: string) {
  const separatorIndex = label.indexOf(FINANCE_SOURCE_LABEL_SEPARATOR);
  return separatorIndex < 0
    ? label
    : label.slice(separatorIndex + FINANCE_SOURCE_LABEL_SEPARATOR.length);
}

function captureSafeUncontrolledValues(form: HTMLFormElement) {
  const values = new Map<string, string>();
  for (const entry of Array.from(form.elements)) {
    if (
      entry instanceof HTMLInputElement &&
      (entry.name === "amount" ||
        entry.name === "reference" ||
        entry.name.startsWith("allocation:"))
    ) {
      values.set(entry.name, entry.value);
    }
  }
  return values;
}

function restoreSafeUncontrolledValues(
  form: HTMLFormElement | null,
  values: Map<string, string>,
) {
  if (!form) return;
  for (const [name, value] of values) {
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement) control.value = value;
  }
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      {children}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="default">
      {pending ? "Saving…" : label}
    </Button>
  );
}

function DefinitionRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-md border border-border">
      {rows.map(([label, value]) => (
        <div
          className="grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-3 border-b border-border px-3 py-2 last:border-b-0"
          key={label}
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
