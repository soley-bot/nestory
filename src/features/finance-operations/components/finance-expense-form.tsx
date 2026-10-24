"use client";

import Link from "next/link";

import { useActionState, useEffect, useRef, useState } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";

import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";

import { NumberInput } from "@/components/ui/number-input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";

import { findConfiguredAccountId } from "@/features/finance-accounts/finance-account-selection";

import { submitExpenseAction } from "@/features/finance-operations/actions";

import type { ExpenseSubmissionSummary, FinanceOperationsActionState, FinanceOperationsData, TenantInvoiceSummary } from "@/features/finance-operations/finance-operations.types";

import { useBusinessDate } from "@/lib/dates/business-date-provider";

import { formatMoneyDisplay } from "@/lib/money/format";

import { useStableActionId, useSuccess, ReceiptEvidenceField, Field, ActionMessage, DefinitionRows } from "./finance-form-primitives";
import type { FinanceOperationsScreenProps } from "./finance-operations-screen";
const actionInitialState: FinanceOperationsActionState = {};

type ExpenseFormProps = {
  canPostTenantExpense?: boolean;
  canPostExpense?: boolean;
  lockScope?: boolean;
  replacement?: ExpenseSubmissionSummary;
  expenseAccounts: FinanceOperationsData["expenseAccounts"];
  fixedScope?: FinanceOperationsScreenProps["scope"];
  initialInvoiceId?: string;
  initialResponsibility?: "owner" | "tenant";
  invoices: TenantInvoiceSummary[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  canCreateVendor?: boolean;
  peopleOptions: FinanceOperationsData["peopleOptions"];
  positions: FinanceOperationsData["positions"];
  propertyOptions: FinanceOperationsData["propertyOptions"];
  payFromAccounts: FinanceOperationsData["payFromAccounts"];
  unitOptions: FinanceOperationsData["unitOptions"];
};

export function ExpenseForm(props: ExpenseFormProps) {
  if (props.replacement || (props.initialResponsibility ?? "owner") === "owner") {
    return <OwnerExpenseTransactionForm {...props} />;
  }
  return (
    <SingleLineExpenseForm
      canPostExpense={props.canPostTenantExpense}
      expenseAccounts={props.expenseAccounts}
      fixedScope={props.fixedScope}
      initialInvoiceId={props.initialInvoiceId}
      initialResponsibility={props.initialResponsibility}
      invoices={props.invoices}
      onClose={props.onClose}
      onSuccess={props.onSuccess}
      propertyOptions={props.propertyOptions}
      payFromAccounts={props.payFromAccounts}
      unitOptions={props.unitOptions}
    />
  );
}

type OwnerExpenseDraftLine = {
  tenantInvoiceId?: string | null;
  internalMarkup?: string;
  amount: string;
  categoryAccountId: string;
  description: string;
  key: number;
  ownerCashAmount: string;
  propertyId: string;
  unitId: string;
};

function OwnerExpenseTransactionForm({
  canPostExpense = false,
  lockScope = false,
  replacement,
  canCreateVendor = false,
  expenseAccounts,
  fixedScope,
  onClose,
  onSuccess,
  peopleOptions,
  positions,
  propertyOptions,
  payFromAccounts,
  unitOptions,
}: ExpenseFormProps) {
  const tenantCorrection = replacement?.responsibility === "tenant";
  const lockedAttribution = Boolean(replacement && (tenantCorrection || !replacement.transactionId));
  const posting = canPostExpense && !replacement;
  const { getBusinessDateValue } = useBusinessDate();
  const activeCategories = expenseAccounts.filter((account) => !tenantCorrection || account.useForLeaseCredits === true);
  const defaultPropertyId = fixedScope?.propertyId ?? "";
  const defaultUnitId = fixedScope?.kind === "unit" ? fixedScope.id : "";
  const nextLineKey = useRef((replacement?.lines?.length ?? 1) + 1);
  const allocationDetails = useRef(new Map<number, HTMLDetailsElement>());
  const idempotencyKey = useStableActionId("expense-transaction");
  const [state, action, pending] = useActionState(
    async (previousState: FinanceOperationsActionState, formData: FormData): Promise<FinanceOperationsActionState> => {
      if (formData.get("payeeMode") === "person" && !formData.get("payeePersonId")) {
        return { status: "error", fieldErrors: { payeePersonId: ["Choose a vendor or one-time payee."] } };
      }
      return submitExpenseAction(previousState, formData);
    },
    actionInitialState,
  );
  useEffect(() => {
    if (state.status === "error" && !pending) {
      for (const details of allocationDetails.current.values()) details.open = true;
    }
  }, [pending, state]);
  const [expenseDate, setExpenseDate] = useState(replacement?.date ?? getBusinessDateValue());
  const [externalPayeeLabel, setExternalPayeeLabel] = useState(replacement?.externalPayeeLabel ?? replacement?.vendorLabel ?? "");
  const [payeeValue, setPayeeValue] = useState(replacement ? replacement.payeePersonId ? `person:${replacement.payeePersonId}` : "external" : "");
  const [reference, setReference] = useState(replacement?.reference ?? "");
  const [lines, setLines] = useState<OwnerExpenseDraftLine[]>(replacement?.lines?.map((line, index) => ({
    tenantInvoiceId: line.tenantInvoiceId,
    amount: String(line.amount), internalMarkup: String(line.internalMarkup), categoryAccountId: line.categoryAccountId ?? "",
    description: line.description, key: index + 1,
    ownerCashAmount: line.ownerCashAmount === null ? "" : String(line.ownerCashAmount),
    propertyId: line.propertyId, unitId: line.unitId ?? "",
  })) ?? [
    {
      amount: "",
      categoryAccountId: defaultPropertyId ? activeCategories.find((account) => account.propertyId === null || account.propertyId === defaultPropertyId)?.id ?? "" : "",
      description: "",
      key: 1,
      ownerCashAmount: "",
      propertyId: defaultPropertyId,
      unitId: defaultUnitId,
    },
  ]);
  const distinctPropertyIds = [...new Set(lines.map((line) => line.propertyId).filter(Boolean))];
  const eligibleSources = payFromAccounts.filter(
    (source) =>
      lines.every((line) => Boolean(line.propertyId)) &&
      (source.propertyId == null ||
      (distinctPropertyIds.length === 1 && source.propertyId === distinctPropertyIds[0])),
  );
  const [payFromAccountId, setPayFromAccountId] = useState(
    replacement?.payFromAccountId ?? (defaultPropertyId
      ? findConfiguredAccountId(eligibleSources, "operating_bank", defaultPropertyId) ?? eligibleSources[0]?.id ?? ""
      : ""),
  );
  const effectivePayFromAccountId = eligibleSources.some(
    (source) => source.id === payFromAccountId,
  )
    ? payFromAccountId
    : replacement ? "" : findConfiguredAccountId(eligibleSources, "operating_bank", distinctPropertyIds.length === 1 ? distinctPropertyIds[0] : null) ?? eligibleSources[0]?.id ?? "";
  useSuccess(state, onSuccess);

  const orderedPayees = peopleOptions
    .filter((person) => person.roles?.includes("vendor"))
    .sort((left, right) => left.label.localeCompare(right.label));
  const payeePersonId = payeeValue.startsWith("person:")
    ? payeeValue.slice("person:".length)
    : "";
  const payeeMode = payeeValue === "external" ? "external" : "person";

  function updateLine(
    key: number,
    patch: Partial<OwnerExpenseDraftLine>,
  ) {
    setLines((current) =>
      current.map((line) => line.key === key ? { ...line, ...patch } : line),
    );
  }

  const linePayload = lines.map((line) => ({
    amount: line.amount,
    categoryAccountId: line.categoryAccountId,
    description: line.description,
    internalMarkupAmount: line.internalMarkup ?? "0",
    ownerCashAmount: tenantCorrection ? null : line.ownerCashAmount || null,
    propertyId: line.propertyId,
    tenantInvoiceId: line.tenantInvoiceId ?? null,
    unitId: line.unitId || null,
  }));
  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const chargedTotal = lines.reduce((sum, line) => sum + Number(line.amount || 0) + Number(line.internalMarkup || 0), 0);

  return (
    <RecordForm
      action={action}
      allowSaveWhenClean={false}
      ariaLabel="Record property expense form"
      onCancel={onClose}
      pending={pending}
      saveLabel={replacement ? "Save changes" : posting ? "Post expense" : "Submit for review"}
      savingLabel={replacement ? "Saving expense" : posting ? "Posting expense" : "Submitting expense"}
      state={state}
    >
      <input name="expenseIntent" type="hidden" value={posting ? "post" : "review"} />
      <input name="expenseDate" type="hidden" value={expenseDate} />
      <input name="externalPayeeLabel" type="hidden" value={externalPayeeLabel} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="lines" type="hidden" value={JSON.stringify(linePayload)} />
      <input name="payeeMode" type="hidden" value={payeeMode} />
      <input name="payeePersonId" type="hidden" value={payeePersonId} />
      <input
        name="payFromAccountId"
        type="hidden"
        value={effectivePayFromAccountId}
      />
      <input name="reference" type="hidden" value={reference} />
      <input name="responsibility" type="hidden" value={replacement?.responsibility ?? "owner"} />
      {replacement ? <>
        <input name={replacement.transactionId ? "replacementTransactionId" : "replacementSubmissionId"} type="hidden" value={replacement.transactionId ?? replacement.id} />
        <input name="expectedStatus" type="hidden" value={replacement.status} />
        <p className="text-sm text-muted-foreground">{replacement.status === "approved"
          ? "Save updates the expense and its financial effects together. The original, correction reason, and replacement remain in history."
          : "Your changes replace the pending submission. The previous version remains in history."}</p>
        {replacement.status === "approved" ? (
          <RecordField error={state.fieldErrors?.reversalDate?.[0]} label="Change date" name="reversalDate" required>
            <DatePickerField name="reversalDate" defaultValue={replacement.date} required />
          </RecordField>
        ) : <input name="reversalDate" type="hidden" value={getBusinessDateValue()} />}
        <RecordField error={state.fieldErrors?.replacementReason?.[0]} label="Reason for change" name="replacementReason" required>
          <Input name="replacementReason" minLength={3} maxLength={500} required />
        </RecordField>
        {replacement.evidence ? <p className="text-sm text-muted-foreground">Original receipt: {replacement.evidence.fileName}. The receipt is retained automatically. Choose another file only if you want to replace it.</p> : null}
      </> : null}

      <FormSection
        indentContent={false}
        title="Expense"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField label="Paid to" name="payeePersonId" required error={payeeValue ? undefined : state.fieldErrors?.payeePersonId?.[0]}>
            <SelectControl
              ariaLabel="Paid to"
              onValueChange={setPayeeValue}
              options={[
                ...orderedPayees.map((person) => ({
                  label: `Vendor · ${person.label}`,
                  value: `person:${person.id}`,
                })),
                { label: "One-time external payee", value: "external" },
              ]}
              placeholder="Choose vendor or external payee"
              required
              value={payeeValue}
            />
            {canCreateVendor ? (
              <Link
                className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
                href="/vendors?action=create"
                target="_blank"
              >
                Create vendor
              </Link>
            ) : null}
          </RecordField>

          {payeeValue === "external" ? (
            <Field label="External payee name">
              <Input
                onChange={(event) => setExternalPayeeLabel(event.target.value)}
                placeholder="One-time payee"
                required
                value={externalPayeeLabel}
              />
            </Field>
          ) : null}
        </div>

        <div className="space-y-4">
          {lines.map((line, index) => {
            const heldCash = positions.find(
              (position) => position.propertyId === line.propertyId,
            )?.cashHeldByIps;
            return (
              <div className={lines.length > 1 ? "border-t border-border/70 pt-4" : ""} key={line.key}>
                {lines.length > 1 && !lockedAttribution ? (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Expense line {index + 1}</p>
                    <Button
                      aria-label={`Remove expense line ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Property">
                      <SelectControl
                        ariaLabel={index === 0 ? "Property" : `Expense line ${index + 1} property`}
                        disabled={lockScope || lockedAttribution}
                        placeholder="Choose property"
                        required
                        onValueChange={(propertyId) => updateLine(line.key, { propertyId, unitId: "", categoryAccountId: activeCategories.find((account) => account.propertyId === null || account.propertyId === propertyId)?.id ?? "" })}
                        options={propertyOptions.map((property) => ({ label: property.label, value: property.id }))}
                        value={line.propertyId}
                      />
                  </Field>
                  <Field label="Unit">
                      <SelectControl
                        ariaLabel={`Expense line ${index + 1} unit`}
                        disabled={lockedAttribution || (lockScope && fixedScope?.kind === "unit")}
                        onValueChange={(unitId) => updateLine(line.key, { unitId })}
                        options={[
                          { label: "No unit", value: "" },
                          ...unitOptions
                            .filter((unit) => unit.propertyId === line.propertyId)
                            .map((unit) => ({ label: unit.label, value: unit.id })),
                        ]}
                        value={line.unitId}
                      />
                  </Field>
                  <Field label="Category">
                    <SelectControl
                      ariaLabel={index === 0 ? "Category" : `Expense line ${index + 1} category`}
                      placeholder="Choose category"
                      onValueChange={(categoryAccountId) => updateLine(line.key, { categoryAccountId })}
                      options={activeCategories.filter((account) => account.propertyId === null || account.propertyId === line.propertyId).map((category) => ({
                        label: category.displayName,
                        value: category.id,
                      }))}
                      required
                      value={line.categoryAccountId}
                    />
                  </Field>
                  <Field label="Description">
                    <Input
                      aria-label="Expense description"
                      onChange={(event) => updateLine(line.key, { description: event.target.value })}
                      placeholder="What was purchased or completed?"
                      required
                      value={line.description}
                    />
                  </Field>
                  <Field label="Amount paid">
                    <NumberInput currencyPaste
                      aria-label="Line amount"
                      onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                      className="h-10 text-lg font-semibold tabular-nums md:text-lg"
                      required
                      value={line.amount}
                    />
                  </Field>
                  {!tenantCorrection ? <details
                    className="sm:col-span-2"
                    ref={(element) => {
                      if (element) allocationDetails.current.set(line.key, element);
                      else allocationDetails.current.delete(line.key);
                    }}
                  >
                    <summary className="cursor-pointer rounded-sm text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                      Owner cash · {line.ownerCashAmount === ""
                        ? "Automatic"
                        : formatMoneyDisplay(Number(line.ownerCashAmount)).primary}
                    </summary>
                    <div className="mt-3 sm:max-w-sm">
                      <Field label="Use owner funds held by management">
                        <NumberInput currencyPaste
                          aria-label="Use owner funds held by management"
                          max={line.amount || undefined}
                          min="0"
                          onChange={(event) => updateLine(line.key, { ownerCashAmount: event.target.value })}
                          placeholder="Automatic"
                          value={line.ownerCashAmount}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span>Automatic when left blank</span>
                          {heldCash === undefined
                            ? "."
                            : ` · ${formatMoneyDisplay(heldCash).primary} currently held.`}
                        </p>
                      </Field>
                    </div>
                  </details> : <p className="text-sm text-muted-foreground sm:col-span-2">The original tenant invoice, property and unit are retained. Settled charges cannot be replaced; payment allocations must remain intact.</p>}
                  {replacement ? <Field label="Markup"><NumberInput aria-label="Line markup" value={line.internalMarkup ?? "0"} onChange={(event) => updateLine(line.key, { internalMarkup: event.target.value })} min="0" /></Field> : null}
                </div>
              </div>
            );
          })}
          <Button
            disabled={lockedAttribution || lines.length >= 20}
            onClick={() => {
              const key = nextLineKey.current;
              nextLineKey.current += 1;
              setLines((current) => {
                const propertyId = current.at(-1)?.propertyId ?? defaultPropertyId;
                return [...current, {
                amount: "",
                categoryAccountId: activeCategories.find((account) => account.propertyId === null || account.propertyId === propertyId)?.id ?? "",
                description: "",
                key,
                ownerCashAmount: "",
                propertyId,
                unitId: lockScope ? defaultUnitId : "",
              }];
              });
            }}
            type="button"
            variant="outline"
          >
            <Plus size={14} /> Add line
          </Button>
        </div>
      </FormSection>

      <FormSection
        indentContent={false}
        title="Payment"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid date">
            <Input
              onChange={(event) => setExpenseDate(event.target.value)}
              type="date"
              value={expenseDate}
            />
          </Field>
          <Field label="Pay from">
            <SelectControl
              ariaLabel="Pay from"
              onValueChange={setPayFromAccountId}
              options={eligibleSources.map((source) => ({ label: source.displayName, value: source.id }))}
              placeholder={distinctPropertyIds.length === 0 ? "Choose property first" : eligibleSources.length > 0 ? "Choose account" : "No common paid-from account"}
              required
              value={effectivePayFromAccountId}
            />
          </Field>
          {posting ? (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input key={effectivePayFromAccountId} type="checkbox" name="confirmedPayFromAccountId" value={effectivePayFromAccountId} required disabled={!effectivePayFromAccountId} />
              I confirm this expense was paid from {eligibleSources.find((source) => source.id === effectivePayFromAccountId)?.displayName ?? "the selected account"}.
            </label>
          ) : null}
          {replacement && !effectivePayFromAccountId ? <p className="text-sm text-warning sm:col-span-2">Choose a paid-from account. The original account is unavailable for these properties.</p> : null}
          <Field label="Reference (optional)">
            <Input
              onChange={(event) => setReference(event.target.value)}
              placeholder="Receipt number or transfer note"
              value={reference}
            />
          </Field>
          <div className="sm:col-span-2">
            <ReceiptEvidenceField required={Boolean(replacement?.evidence)} />
          </div>

        </div>
      </FormSection>
      <section aria-label="Financial preview" className="space-y-2">
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt>Total paid</dt><dd className="text-xl font-semibold tabular-nums">{formatMoneyDisplay(total).primary}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>{tenantCorrection ? "Charge on tenant invoice" : "Cost charged to owner"}</dt><dd className="font-medium tabular-nums">{formatMoneyDisplay(chargedTotal).primary}</dd>
          </div>
        </dl>
        {tenantCorrection ? <p className="text-xs text-muted-foreground">The corrected cost and markup remain charged to the original tenant invoice. Existing settlements must be reconciled before correction.</p> : <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1 focus-visible:outline-2 focus-visible:outline-ring">How owner cash is applied</summary>
          <p className="mt-1">Available owner cash is applied; the remainder is due from the owner.</p>
        </details>}
      </section>
      <ActionMessage state={state} />
    </RecordForm>
  );
}

function SingleLineExpenseForm({
  canPostExpense = false,
  expenseAccounts,
  fixedScope,
  initialInvoiceId,
  initialResponsibility,
  invoices,
  onClose,
  onSuccess,
  propertyOptions,
  payFromAccounts,
  unitOptions,
}: {
  canPostExpense?: boolean;
  expenseAccounts: FinanceOperationsData["expenseAccounts"];
  fixedScope?: FinanceOperationsScreenProps["scope"];
  initialInvoiceId?: string;
  initialResponsibility?: "owner" | "tenant";
  invoices: TenantInvoiceSummary[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  propertyOptions: FinanceOperationsData["propertyOptions"];
  payFromAccounts: FinanceOperationsData["payFromAccounts"];
  unitOptions: FinanceOperationsData["unitOptions"];
}) {
  const { getBusinessDateValue } = useBusinessDate();
  const idempotencyKey = useStableActionId("expense");
  const effectiveResponsibility = initialResponsibility ?? "owner";
  const posting = canPostExpense && effectiveResponsibility === "tenant";
  const initialInvoice = invoices.find(
    (invoice) => invoice.id === initialInvoiceId,
  );
  const initialPropertyId = fixedScope?.propertyId ?? initialInvoice?.propertyId ?? "";
  const initialExpenseAccounts = expenseAccounts.filter(
    (account) =>
      Boolean(initialPropertyId) &&
      (account.propertyId === null || account.propertyId === initialPropertyId) &&
      (effectiveResponsibility === "owner" || account.useForLeaseCredits === true),
  );
  const initialPayFromAccounts = payFromAccounts.filter(
    (account) =>
      Boolean(initialPropertyId) &&
      (account.propertyId === null || account.propertyId === initialPropertyId),
  );
  const [state, action, pending] = useActionState(
    submitExpenseAction,
    actionInitialState,
  );
  const [propertyId, setPropertyId] = useState(
    initialPropertyId,
  );
  const [unitId, setUnitId] = useState(
    fixedScope?.kind === "unit"
      ? fixedScope.id
      : (initialInvoice?.unitId ?? ""),
  );
  const [categoryAccountId, setCategoryAccountId] = useState(
    initialExpenseAccounts[0]?.id ?? "",
  );
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [markup, setMarkup] = useState("0");
  const [expenseDate, setExpenseDate] = useState(getBusinessDateValue());
  const [reference, setReference] = useState("");
  const [payFromAccountId, setPayFromAccountId] = useState(
    findConfiguredAccountId(initialPayFromAccounts, "operating_bank", initialPropertyId)
      ?? initialPayFromAccounts[0]?.id
      ?? "",
  );
  const [tenantInvoiceId, setTenantInvoiceId] = useState(
    initialInvoiceId ?? "",
  );
  const matchingInvoices = invoices.filter(
    (invoice) =>
      invoice.propertyId === propertyId &&
      invoice.balanceDue > 0 &&
      (!unitId || invoice.unitId === unitId),
  );
  const matchingPayFromAccounts = payFromAccounts.filter(
    (account) => account.propertyId == null || account.propertyId === propertyId,
  );
  const matchingExpenseAccounts = expenseAccounts.filter(
    (account) =>
      (account.propertyId === null || account.propertyId === propertyId) &&
      (effectiveResponsibility === "owner" || account.useForLeaseCredits === true),
  );
  const selectedPayFromAccount = matchingPayFromAccounts.find(
    (account) => account.id === payFromAccountId,
  );
  const effectiveMarkup = effectiveResponsibility === "tenant" ? markup : "0";
  const invoiceTotal = Number(cost || 0) + Number(effectiveMarkup || 0);
  const expenseAmount = Number(cost || 0);
  const expenseFormLabel =
    effectiveResponsibility === "tenant"
      ? "Record recoverable cost form"
      : "Record property expense form";
  useSuccess(state, onSuccess);
  return (
    <RecordForm
      action={action}
      allowSaveWhenClean={false}
      ariaLabel={expenseFormLabel}
      onCancel={onClose}
      onSave={
        effectiveResponsibility === "tenant" && !tenantInvoiceId
          ? (form) => {
              form
                .querySelector<HTMLElement>('[aria-label="Recharge invoice"]')
                ?.focus();
            }
          : undefined
      }
      pending={pending}
      saveLabel={
        effectiveResponsibility === "tenant" && !tenantInvoiceId
          ? "Choose invoice first"
          : posting ? "Post expense" : "Submit for review"
      }
      savingLabel={posting ? "Posting expense" : "Submitting expense"}
      state={state}
    >
      <input name="expenseIntent" type="hidden" value={posting ? "post" : "review"} />
      {posting ? <>
        <input name="payeeMode" type="hidden" value="external" />
        <input name="externalPayeeLabel" type="hidden" value={vendor} />
        <input name="lines" type="hidden" value={JSON.stringify([{ amount: cost, internalMarkupAmount: effectiveMarkup, categoryAccountId, description: reference.trim().length >= 2 ? reference.trim() : vendor.trim(), propertyId, unitId: unitId || null, tenantInvoiceId, ownerCashAmount: null }])} />
      </> : null}
      <input name="propertyId" type="hidden" value={propertyId} />
      <input name="unitId" type="hidden" value={unitId} />
      <input name="categoryAccountId" type="hidden" value={categoryAccountId} />
      <input name="vendorLabel" type="hidden" value={vendor} />
      <input name="internalCost" type="hidden" value={cost} />
      <input name="internalMarkup" type="hidden" value={effectiveMarkup} />
      <input name="expenseDate" type="hidden" value={expenseDate} />
      <input name="reference" type="hidden" value={reference} />
      <input
        name="payFromAccountId"
        type="hidden"
        value={payFromAccountId}
      />
      <input
        name="responsibility"
        type="hidden"
        value={effectiveResponsibility}
      />
      <input
        name="tenantInvoiceId"
        type="hidden"
        value={effectiveResponsibility === "tenant" ? tenantInvoiceId : ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <FormSection
        indentContent={false}
        title="Expense"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property">
            {fixedScope ? (
              <div className="flex min-h-8 items-center border-b border-border px-1 text-sm font-medium">
                {fixedScope.propertyLabel}
              </div>
            ) : (
              <SelectControl
                ariaLabel="Property"
                onValueChange={(value) => {
                  setPropertyId(value);
                  setUnitId("");
                  setTenantInvoiceId("");
                  const propertyExpenseAccounts = expenseAccounts.filter(
                    (account) =>
                      (account.propertyId === null || account.propertyId === value) &&
                      (effectiveResponsibility === "owner" ||
                        account.useForLeaseCredits === true),
                  );
                  setCategoryAccountId(propertyExpenseAccounts[0]?.id ?? "");
                  const propertyAccounts = payFromAccounts.filter(
                    (account) => !account.propertyId || account.propertyId === value,
                  );
                  setPayFromAccountId(
                    findConfiguredAccountId(propertyAccounts, "operating_bank", value)
                      ?? propertyAccounts[0]?.id
                      ?? "",
                  );
                }}
                options={propertyOptions.map((option) => ({
                  label: option.label,
                  value: option.id,
                }))}
                placeholder="Choose property"
                required
                value={propertyId}
              />
            )}
          </Field>
          <Field label="Unit">
            {fixedScope?.kind === "unit" ? (
              <div className="flex min-h-8 items-center border-b border-border px-1 text-sm font-medium">
                {fixedScope.label}
              </div>
            ) : (
              <SelectControl
                onValueChange={(value) => {
                  setUnitId(value);
                  const selectedInvoice = invoices.find(
                    (invoice) => invoice.id === tenantInvoiceId,
                  );
                  if (selectedInvoice?.unitId !== (value || null)) {
                    setTenantInvoiceId("");
                  }
                }}
                options={[
                  { label: "No unit", value: "" },
                  ...unitOptions
                    .filter((option) => option.propertyId === propertyId)
                    .map((option) => ({
                      label: option.label,
                      value: option.id,
                    })),
                ]}
                value={unitId}
              />
            )}
          </Field>
          <Field label="Category">
            <SelectControl
              ariaLabel="Category"
              onValueChange={setCategoryAccountId}
              options={matchingExpenseAccounts.map((account) => ({
                label: account.displayName,
                value: account.id,
              }))}
              placeholder="Choose category"
              required
              value={categoryAccountId}
            />
          </Field>
          <Field label="Paid to">
            <Input
              onChange={(event) => setVendor(event.target.value)}
              placeholder="Vendor or payee"
              required
              value={vendor}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        indentContent={false}
        title="Payment"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount paid">
            <NumberInput currencyPaste
              onChange={(event) => setCost(event.target.value)}
              required
              value={cost}
            />
          </Field>
          <Field label="Paid date">
            <Input
              onChange={(event) => setExpenseDate(event.target.value)}
              type="date"
              value={expenseDate}
            />
          </Field>
          <Field label="Pay from">
            <SelectControl
              ariaLabel="Pay from"
              onValueChange={setPayFromAccountId}
              options={matchingPayFromAccounts.map((account) => ({
                label: account.displayName,
                value: account.id,
              }))}
              placeholder={
                propertyId
                  ? matchingPayFromAccounts.length > 0
                    ? "Choose paid-from account"
                    : "No paid-from account available"
                  : "Choose property first"
              }
              required
              value={payFromAccountId}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        indentContent={false}
        title="Tenant charge"
      >
        {effectiveResponsibility === "tenant" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recharge invoice">
              <SelectControl
                ariaLabel="Recharge invoice"
                onValueChange={(value) => {
                  setTenantInvoiceId(value);
                  const invoice = invoices.find((item) => item.id === value);
                  setUnitId(invoice?.unitId ?? "");
                }}
                options={matchingInvoices.map((invoice) => ({
                  label: `${invoice.recipientLabel} · ${invoice.invoiceNumber}`,
                  value: invoice.id,
                }))}
                placeholder={
                  !propertyId
                    ? "Choose property first"
                    : matchingInvoices.length > 0
                      ? "Choose invoice"
                      : "No open invoice"
                }
                required
                value={tenantInvoiceId}
              />
            </Field>
            <Field label="Service fee (optional)">
              <NumberInput currencyPaste
                onChange={(event) => setMarkup(event.target.value)}
                required
                value={markup}
              />
            </Field>
            <div className="sm:col-span-2">
              <DefinitionRows
                rows={[
                  [
                    "Company cost",
                    formatMoneyDisplay(expenseAmount).primary,
                  ],
                  [
                    "Service fee",
                    formatMoneyDisplay(Number(effectiveMarkup || 0)).primary,
                  ],
                  [
                    "Tenant invoice",
                    formatMoneyDisplay(invoiceTotal).primary,
                  ],
                  ["Owner P&L", "No impact"],
                ]}
              />
            </div>
            {!propertyId ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">Choose a property to see its open invoices.</p>
            ) : matchingInvoices.length === 0 ? (
              <div className="space-y-1 text-sm sm:col-span-2">
                <p>No open invoice for this property and unit.</p>
                <Link className="font-medium text-primary underline-offset-2 hover:underline" href="/rent-income">
                  Open Rent &amp; collections
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-border/80">
            <DefinitionRows
              rows={[
                [
                  "Cost charged to owner",
                  formatMoneyDisplay(expenseAmount).primary,
                ],
                ["Payment made by", "Management company"],
                [
                  "Paid from account",
                  selectedPayFromAccount
                    ? selectedPayFromAccount.displayName
                    : "Choose paid-from account",
                ],
                [
                  "Owner account after approval",
                  `Owner balance increases by ${formatMoneyDisplay(expenseAmount).primary}`,
                ],
              ]}
            />
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              After approval, available owner-held cash is applied
              automatically. Any remainder becomes an amount due from the
              owner.
            </p>
          </div>
        )}
      </FormSection>

      <FormSection
        indentContent={false}
        title="Receipt"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference (optional)">
            <Input
              onChange={(event) => setReference(event.target.value)}
              placeholder="Receipt number or transfer note"
              value={reference}
            />
          </Field>
          <div className="sm:col-span-2">
            <ReceiptEvidenceField />
          </div>
        </div>
      </FormSection>
      {posting ? <label className="flex items-start gap-2 text-sm">
        <input key={payFromAccountId} type="checkbox" name="confirmedPayFromAccountId" value={payFromAccountId} required disabled={!selectedPayFromAccount} />
        I confirm this expense was paid from {selectedPayFromAccount?.displayName ?? "the selected account"}.
      </label> : null}
      <ActionMessage state={state} />
    </RecordForm>
  );
}
