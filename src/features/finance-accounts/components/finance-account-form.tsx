"use client";

import { useActionState, useState } from "react";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import {
  createFinanceAccountAction,
  updateFinanceAccountAction,
  type FinanceAccountActionState,
} from "@/features/finance-accounts/actions";
import type {
  FinanceAccountClass,
  FinanceAccountPropertyOption,
  FinanceAccountSummary,
} from "@/features/finance-accounts/finance-accounts.types";

const initialActionState: FinanceAccountActionState = {};

const accountTypeOptions = [
  ["asset:bank", "Asset · Bank"],
  ["asset:cash", "Asset · Cash"],
  ["asset:petty_cash", "Asset · Petty cash"],
  ["asset:accounts_receivable", "Asset · Accounts receivable"],
  ["asset:other_current_asset", "Asset · Other current asset"],
  ["asset:fixed_asset", "Asset · Fixed asset"],
  ["asset:other_asset", "Asset · Other asset"],
  ["liability:accounts_payable", "Liability · Accounts payable"],
  ["liability:credit_card", "Liability · Credit card"],
  ["liability:current_liability", "Liability · Current liability"],
  ["liability:long_term_liability", "Liability · Long-term liability"],
  ["equity:equity", "Equity"],
  ["income:income", "Income"],
  ["income:other_income", "Income · Other income"],
  ["expense:expense", "Expense"],
  ["expense:other_expense", "Expense · Other expense"],
  ["expense:cogs", "Expense · Cost of goods sold"],
] as const;

type FinanceAccountFormProps = {
  account?: FinanceAccountSummary;
  accounts: readonly FinanceAccountSummary[];
  mode: "create" | "edit";
  onCancel: () => void;
  properties: readonly FinanceAccountPropertyOption[];
};

export function FinanceAccountForm({
  account,
  accounts,
  mode,
  onCancel,
  properties,
}: FinanceAccountFormProps) {
  const action = mode === "create"
    ? createFinanceAccountAction
    : updateFinanceAccountAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [accountType, setAccountType] = useState(
    account ? `${account.accountClass}:${account.accountSubtype}` : "asset:bank",
  );
  const [isSubAccount, setIsSubAccount] = useState(Boolean(account?.parentAccountId));
  const [accountClass, accountSubtype] = accountType.split(":") as [
    FinanceAccountClass,
    string,
  ];
  const parentAccounts = accounts.filter(
    (candidate) =>
      candidate.depth === 0 &&
      candidate.accountClass === accountClass &&
      candidate.id !== account?.id,
  );
  const supportsAvailability =
    accountClass === "asset" && ["bank", "cash", "petty_cash"].includes(accountSubtype);
  const statusMessage = state.status === "error"
    ? state.message ?? "Check the highlighted fields."
    : state.message;

  return (
    <RecordForm
      action={formAction}
      ariaLabel={mode === "create" ? "New account form" : "Edit account form"}
      hideSaveOnSuccess
      onCancel={onCancel}
      pending={pending}
      saveLabel={mode === "create" ? "Add account" : "Save changes"}
      savingLabel={mode === "create" ? "Adding account" : "Saving changes"}
      state={state}
    >
      <p aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
      {account ? <input name="accountId" type="hidden" value={account.id} /> : null}
      <input name="accountClass" type="hidden" value={accountClass} />
      <input name="accountSubtype" type="hidden" value={accountSubtype} />

      <FormSection title="Account details">
        <RecordField
          error={state.fieldErrors?.accountClass?.[0] ?? state.fieldErrors?.accountSubtype?.[0]}
          label="Account type"
          name="accountClass"
          required
        >
          <select
            aria-label="Account type"
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted"
            disabled={mode === "edit"}
            onChange={(event) => {
              setAccountType(event.target.value);
              setIsSubAccount(false);
            }}
            value={accountType}
          >
            {accountTypeOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </RecordField>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <RecordField
            error={state.fieldErrors?.displayName?.[0]}
            label="Account name"
            name="displayName"
            required
          >
            <Input defaultValue={account?.displayName} maxLength={100} name="displayName" required />
          </RecordField>
          <RecordField
            error={state.fieldErrors?.accountNumber?.[0]}
            label="Account number"
            name="accountNumber"
          >
            <Input defaultValue={account?.accountNumber ?? ""} maxLength={24} name="accountNumber" />
          </RecordField>
        </div>

        <RecordField
          error={state.fieldErrors?.description?.[0]}
          label="Description"
          name="description"
        >
          <textarea
            className="min-h-20 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            defaultValue={account?.description ?? ""}
            maxLength={1000}
            name="description"
          />
        </RecordField>

        <label className="flex items-start gap-2 text-sm">
          <input
            checked={!account?.archivedAt}
            className="mt-0.5 size-4 accent-primary"
            disabled
            onChange={() => undefined}
            type="checkbox"
          />
          <span>
            <span className="font-medium">Active account</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {mode === "create" ? "New accounts start active." : "Change status from the account row."}
            </span>
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            checked={isSubAccount}
            className="size-4 accent-primary"
            onChange={(event) => setIsSubAccount(event.target.checked)}
            type="checkbox"
          />
          Sub-account
        </label>
        {isSubAccount ? (
          <RecordField
            error={state.fieldErrors?.parentAccountId?.[0]}
            label="Parent account"
            name="parentAccountId"
            required
          >
            <select
              aria-label="Parent account"
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              defaultValue={account?.parentAccountId ?? ""}
              name="parentAccountId"
              required
            >
              <option value="">Choose parent</option>
              {parentAccounts.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.displayName}
                </option>
              ))}
            </select>
          </RecordField>
        ) : (
          <input name="parentAccountId" type="hidden" value="" />
        )}
      </FormSection>

      {accountClass === "income" || accountClass === "expense" ||
      (accountClass === "liability" && accountSubtype === "current_liability") ||
      supportsAvailability ? (
        <FormSection title="Use this account for">
          {accountClass === "income" ? (
            <WorkflowCheckbox
              defaultChecked={account?.useForLeaseCharges}
              error={state.fieldErrors?.useForLeaseCharges?.[0]}
              label="Use for lease charges"
              name="useForLeaseCharges"
            />
          ) : null}
          {accountClass === "expense" ? (
            <WorkflowCheckbox
              defaultChecked={account?.useForLeaseCredits}
              error={state.fieldErrors?.useForLeaseCredits?.[0]}
              label="Use for lease credits"
              name="useForLeaseCredits"
            />
          ) : null}
          {accountClass === "liability" && accountSubtype === "current_liability" ? (
            <WorkflowCheckbox
              defaultChecked={account?.useForLeaseDeposits}
              error={state.fieldErrors?.useForLeaseDeposits?.[0]}
              label="Use for lease deposits"
              name="useForLeaseDeposits"
            />
          ) : null}
          {supportsAvailability ? (
            <div data-record-field="propertyId">
              <label className="block text-sm font-medium">
                Available to
              <select
                aria-describedby={state.fieldErrors?.propertyId?.[0] ? "propertyId-error" : undefined}
                aria-invalid={state.fieldErrors?.propertyId?.[0] ? "true" : undefined}
                className="mt-2 h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                defaultValue={account?.propertyId ?? ""}
                name="propertyId"
              >
                <option value="">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.label}</option>
                ))}
              </select>
              </label>
              {state.fieldErrors?.propertyId?.[0] ? (
                <p className="mt-1 text-xs text-danger" id="propertyId-error">
                  {state.fieldErrors.propertyId[0]}
                </p>
              ) : null}
            </div>
          ) : null}
        </FormSection>
      ) : null}
    </RecordForm>
  );
}

function WorkflowCheckbox({
  defaultChecked,
  error,
  label,
  name,
}: {
  defaultChecked?: boolean;
  error?: string;
  label: string;
  name: "useForLeaseCharges" | "useForLeaseCredits" | "useForLeaseDeposits";
}) {
  return (
    <div data-record-field={name}>
      <label className="flex items-center gap-2 text-sm font-medium">
      <input
        aria-describedby={error ? `${name}-error` : undefined}
        aria-invalid={error ? "true" : undefined}
        className="size-4 accent-primary"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
        {label}
      </label>
      {error ? <p className="mt-1 text-xs text-danger" id={`${name}-error`}>{error}</p> : null}
    </div>
  );
}
