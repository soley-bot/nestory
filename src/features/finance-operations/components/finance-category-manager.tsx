"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  createFinanceCategoryAction,
  setFinanceCategoryArchivedAction,
  updateFinanceCategoryAction,
} from "@/features/finance-operations/actions";
import type {
  FinanceCategory,
  FinanceOperationsActionState,
} from "@/features/finance-operations/finance-operations.types";
import { cn } from "@/lib/utils";

const actionInitialState: FinanceOperationsActionState = {};

const ownerExpenseReportingGroups = [
  { label: "Vendor bill", value: "vendor_bill" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Utilities", value: "utilities" },
  { label: "Supplies", value: "supplies" },
  { label: "Other owner expense", value: "other" },
];

const tenantBillingReportingGroups = [
  { label: "Utility reimbursement", value: "utility_reimbursement" },
  { label: "Parking", value: "parking" },
  { label: "Late fee", value: "late_fee" },
  { label: "Service fee", value: "service_fee" },
  { label: "Other tenant charge", value: "other" },
];

export function FinanceCategorySetupEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <section
      aria-label="Finance setup"
      className="flex flex-col gap-2 border-y border-border py-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Finance setup
        </h2>
        <p className="text-xs text-muted-foreground">
          Manage the categories used for owner expenses and tenant charges.
        </p>
      </div>
      <Button onClick={onOpen} size="sm" variant="ghost">
        <Settings2 aria-hidden="true" />
        Manage categories
      </Button>
    </section>
  );
}

export function FinanceCategoryManager({
  canManage,
  categories,
}: {
  canManage: boolean;
  categories: FinanceCategory[];
}) {
  return (
    <div className="space-y-5 p-4">
      {!canManage ? (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Super Admin manages category changes. Active categories remain available
          in the relevant Finance workflows.
        </p>
      ) : null}
      <FinanceCategoryNamespaceSection
        canManage={canManage}
        categories={categories.filter(
          (category) => category.namespace === "owner_expense",
        )}
        description="Costs charged to property owners and reported on owner P&L."
        namespace="owner_expense"
        title="Owner expenses"
      />
      <FinanceCategoryNamespaceSection
        canManage={canManage}
        categories={categories.filter(
          (category) => category.namespace === "tenant_billing",
        )}
        description="Non-rent charges shown on tenant invoices. Rent remains lease-owned."
        namespace="tenant_billing"
        title="Tenant billing"
      />
    </div>
  );
}

function FinanceCategoryNamespaceSection({
  canManage,
  categories,
  description,
  namespace,
  title,
}: {
  canManage: boolean;
  categories: FinanceCategory[];
  description: string;
  namespace: FinanceCategory["namespace"];
  title: string;
}) {
  const groups =
    namespace === "owner_expense"
      ? ownerExpenseReportingGroups
      : tenantBillingReportingGroups;
  const systemCategories = categories.filter((category) => category.isDefault);
  const customCategories = categories.filter((category) => !category.isDefault);
  const namespaceLabel =
    namespace === "owner_expense" ? "Owner expense" : "Tenant billing";

  return (
    <section className="space-y-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <FinanceCategoryGroup
        ariaLabel={`${namespaceLabel} system categories`}
        canManage={canManage}
        categories={systemCategories}
        description="Built in for consistent reporting. Labels can be renamed, but these categories cannot be archived."
        emptyMessage="No system categories in this group."
        title="System categories"
      />
      <FinanceCategoryGroup
        ariaLabel={`${namespaceLabel} custom categories`}
        canManage={canManage}
        categories={customCategories}
        description="Workspace-specific categories can be renamed, archived, or restored."
        emptyMessage="No custom categories yet."
        title="Custom categories"
      >
        {canManage ? (
          <FinanceCategoryCreateForm groups={groups} namespace={namespace} />
        ) : null}
      </FinanceCategoryGroup>
    </section>
  );
}

function FinanceCategoryGroup({
  ariaLabel,
  canManage,
  categories,
  children,
  description,
  emptyMessage,
  title,
}: {
  ariaLabel: string;
  canManage: boolean;
  categories: FinanceCategory[];
  children?: ReactNode;
  description: string;
  emptyMessage: string;
  title: string;
}) {
  return (
    <section aria-label={ariaLabel} className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {categories.length > 0 ? (
          categories.map((category) => (
            <FinanceCategoryRow
              canManage={canManage}
              category={category}
              key={category.id}
            />
          ))
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function FinanceCategoryCreateForm({
  groups,
  namespace,
}: {
  groups: { label: string; value: string }[];
  namespace: FinanceCategory["namespace"];
}) {
  const [state, action] = useActionState(
    createFinanceCategoryAction,
    actionInitialState,
  );
  const ownerCategory = namespace === "owner_expense";

  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
      <input name="namespace" type="hidden" value={namespace} />
      <Input
        aria-label={`New ${ownerCategory ? "owner expense" : "tenant billing"} category name`}
        name="displayLabel"
        placeholder="Category name"
        required
      />
      <SelectControl
        ariaLabel={`${ownerCategory ? "Owner expense" : "Tenant billing"} reporting group`}
        defaultValue={groups[0]?.value}
        name="reportingGroup"
        options={groups}
        required
      />
      <CategorySubmitButton
        label={`Add ${ownerCategory ? "owner expense" : "tenant billing"} category`}
      />
      <FinanceCategoryActionMessage state={state} />
    </form>
  );
}

function FinanceCategoryRow({
  canManage,
  category,
}: {
  canManage: boolean;
  category: FinanceCategory;
}) {
  const [renameState, renameAction] = useActionState(
    updateFinanceCategoryAction,
    actionInitialState,
  );
  const [archiveState, archiveAction] = useActionState(
    setFinanceCategoryArchivedAction,
    actionInitialState,
  );

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <Badge tone={category.isDefault ? "neutral" : "accent"}>
          {category.isDefault ? "System" : "Custom"}
        </Badge>
        {!category.isActive ? <Badge tone="neutral">Archived</Badge> : null}
      </div>
      {canManage ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <form action={renameAction} className="flex min-w-0 flex-1 items-end gap-2">
            <input name="categoryId" type="hidden" value={category.id} />
            <input
              name="reportingGroup"
              type="hidden"
              value={category.reportingGroup}
            />
            <label className="min-w-0 flex-1">
              <span className="sr-only">Category name</span>
              <Input
                aria-label={`Rename ${category.displayLabel}`}
                defaultValue={category.displayLabel}
                name="displayLabel"
                required
              />
            </label>
            <CategorySubmitButton
              ariaLabel={`Rename ${category.displayLabel}`}
              label="Rename"
            />
          </form>
          {!category.isDefault ? (
            <form action={archiveAction}>
              <input name="categoryId" type="hidden" value={category.id} />
              <input
                name="archived"
                type="hidden"
                value={category.isActive ? "true" : "false"}
              />
              <CategorySubmitButton
                ariaLabel={`${category.isActive ? "Archive" : "Restore"} ${category.displayLabel}`}
                label={category.isActive ? "Archive" : "Restore"}
              />
            </form>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{category.displayLabel}</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {reportingGroupLabel(category.reportingGroup, category.namespace)}
      </p>
      <FinanceCategoryActionMessage state={renameState} />
      <FinanceCategoryActionMessage state={archiveState} />
    </div>
  );
}

function FinanceCategoryActionMessage({
  state,
}: {
  state: FinanceOperationsActionState;
}) {
  return state.message ? (
    <p
      aria-live={state.status === "error" ? "assertive" : "polite"}
      className={cn(
        "col-span-full text-xs",
        state.status === "error" ? "text-danger" : "text-success",
      )}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  ) : null;
}

function CategorySubmitButton({
  ariaLabel,
  label,
}: {
  ariaLabel?: string;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button aria-label={ariaLabel} disabled={pending} type="submit">
      {pending ? "Saving…" : label}
    </Button>
  );
}

function reportingGroupLabel(
  value: string,
  namespace: FinanceCategory["namespace"],
) {
  const options =
    namespace === "owner_expense"
      ? ownerExpenseReportingGroups
      : tenantBillingReportingGroups;
  const option = options.find((item) => item.value === value);
  return option?.label ?? value.replaceAll("_", " ");
}
