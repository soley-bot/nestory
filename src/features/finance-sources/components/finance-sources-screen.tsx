"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  Landmark,
  Plus,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SearchInput } from "@/components/ui/search-input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { StatusNotice } from "@/components/ui/status-notice";
import {
  archiveFinanceSourceAction,
  createFinanceSourceAction,
  restoreFinanceSourceAction,
  updateFinanceSourceAction,
  type FinanceSourceActionState,
} from "@/features/finance-sources/actions";
import type {
  FinanceSourceKind,
  FinanceSourceScopeKind,
  FinanceSourceSummary,
  FinanceSourcesData,
} from "@/features/finance-sources/finance-sources.types";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";

const actionInitialState: FinanceSourceActionState = {};

const sourceKindLabels: Record<FinanceSourceKind, string> = {
  bank: "Bank",
  cash: "Cash",
  petty_cash: "Petty cash",
  clearing: "Clearing",
  other: "Other",
};

const scopeKindLabels: Record<FinanceSourceScopeKind, string> = {
  organization_pooled: "Organization pooled",
  property_dedicated: "Property dedicated",
};

type LifecycleFilter = "active" | "all" | "archived";
type DrawerState =
  | { mode: "create" }
  | { mode: "manage"; source: FinanceSourceSummary }
  | null;

export function FinanceSourcesScreen({
  canManageSources,
  properties,
  sources,
}: FinanceSourcesData & { canManageSources: boolean }) {
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("active");
  const [query, setQuery] = useState("");
  const activeCount = sources.filter((source) => !source.archivedAt).length;
  const archivedCount = sources.length - activeCount;
  const visibleSources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sources.filter((source) => {
      const lifecycleMatch =
        lifecycle === "all" ||
        (lifecycle === "active" ? !source.archivedAt : source.archivedAt);
      const searchMatch =
        !normalizedQuery ||
        [
          source.code,
          source.displayName,
          source.maskedReference,
          source.propertyLabel,
          sourceKindLabels[source.sourceKind],
        ]
          .filter(Boolean)
          .some((value) =>
            value?.toLocaleLowerCase().includes(normalizedQuery),
          );
      return Boolean(lifecycleMatch && searchMatch);
    });
  }, [lifecycle, query, sources]);

  return (
    <WorkspacePage
      actions={
        canManageSources ? (
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus aria-hidden="true" />
            Add funding source
          </Button>
        ) : null
      }
      breadcrumbItems={[{ href: "/finance", label: "Finance" }]}
      context="Operational cash locations"
      localNav={
        <FinanceWorkspaceNavigation activeRoute="/finance/funding-sources" />
      }
      title="Funding sources"
      toolbar={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SearchInput
            aria-label="Search funding sources"
            className="w-full sm:w-64"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, code, or reference"
            value={query}
          />
          <div
            aria-label="Source status"
            className="inline-flex items-center rounded-lg bg-muted p-0.5"
            role="group"
          >
            {([
              ["active", "Active " + activeCount],
              ["archived", "Archived " + archivedCount],
              ["all", "All " + sources.length],
            ] as const).map(([value, label]) => (
              <Button
                aria-pressed={lifecycle === value}
                className="h-7 px-2.5"
                key={value}
                onClick={() => setLifecycle(value)}
                size="sm"
                variant={lifecycle === value ? "outline" : "ghost"}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <div className="workspace-gutter-x space-y-3 py-4">
        <StatusNotice
          message={
            <>
              These records identify where collected or paid funds moved.{" "}
              <span className="font-medium text-foreground">
                This is not a chart of accounts or bank reconciliation.
              </span>
            </>
          }
          title="Operational funding-source register"
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Available sources</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Currency and scope are fixed at creation; labels and safe
                  masked references remain editable.
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {visibleSources.length} shown
              </span>
            </div>
          </div>

          {visibleSources.length === 0 ? (
            <EmptyState
              body="Change the status filter or search."
              icon={WalletCards}
              kind="filtered"
              title="No funding sources match"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <caption className="sr-only">
                  Active and archived financial reconciliation sources
                </caption>
                <thead className="bg-[var(--table-header-bg)] text-left text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5" scope="col">Source</th>
                    <th className="px-3 py-2.5" scope="col">Type</th>
                    <th className="px-3 py-2.5" scope="col">Scope</th>
                    <th className="px-3 py-2.5" scope="col">Currency</th>
                    <th className="px-3 py-2.5" scope="col">Status</th>
                    <th className="px-4 py-2.5 text-right" scope="col">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleSources.map((source) => (
                    <tr className="align-middle" key={source.id}>
                      <td className="max-w-[24rem] px-4 py-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                            {source.sourceKind === "bank" ? (
                              <Landmark aria-hidden="true" size={15} />
                            ) : source.scopeKind === "property_dedicated" ? (
                              <Building2 aria-hidden="true" size={15} />
                            ) : (
                              <WalletCards aria-hidden="true" size={15} />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                              {source.displayName}
                              {source.code === "IPS_COLLECTIONS" ? (
                                <Badge tone="accent">Default collections</Badge>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                              {source.code}
                              {source.maskedReference
                                ? " · " + source.maskedReference
                                : ""}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {sourceKindLabels[source.sourceKind]}
                      </td>
                      <td className="px-3 py-3">
                        <span className="block font-medium">
                          {scopeKindLabels[source.scopeKind]}
                        </span>
                        {source.propertyLabel ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {source.propertyLabel}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{source.currency}</td>
                      <td className="px-3 py-3">
                        <Badge tone={source.archivedAt ? "warning" : "success"}>
                          {source.archivedAt ? "Archived" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManageSources ? (
                          <Button
                            aria-label={"Manage " + source.displayName}
                            onClick={() => setDrawer({ mode: "manage", source })}
                            size="sm"
                            variant="ghost"
                          >
                            Manage
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <SideDrawer
        description={getDrawerDescription(drawer)}
        onClose={() => setDrawer(null)}
        open={drawer !== null}
        title={drawer?.mode === "create" ? "Add funding source" : "Manage funding source"}
      >
        {drawer?.mode === "create" ? (
          <CreateSourceForm
            onClose={() => setDrawer(null)}
            properties={properties}
          />
        ) : drawer?.mode === "manage" ? (
          <ManageSourceForm
            onClose={() => setDrawer(null)}
            source={drawer.source}
          />
        ) : null}
      </SideDrawer>
    </WorkspacePage>
  );
}

function CreateSourceForm({
  onClose,
  properties,
}: {
  onClose: () => void;
  properties: FinanceSourcesData["properties"];
}) {
  const [state, action, pending] = useActionState(
    createFinanceSourceAction,
    actionInitialState,
  );
  const [scopeKind, setScopeKind] =
    useState<FinanceSourceScopeKind>("organization_pooled");

  return (
    <RecordForm
      action={action}
      ariaLabel="Add funding source form"
      hideSaveOnSuccess
      onCancel={onClose}
      pending={pending}
      saveLabel="Add funding source"
      savingLabel="Adding funding source"
      state={state}
    >
      <ConsequencePanel
        rows={[
          { label: "Currency", value: "USD · locked" },
          {
            label: "Scope",
            value: scopeKindLabels[scopeKind],
          },
        ]}
        summary="Choose the real location or operational pool that receives or pays funds. This does not create an accounting account."
        title="Source identity"
      />
      <FormSection title="Source details">
        <RecordField error={state.fieldErrors?.displayName?.[0]} label="Name" name="displayName" required>
          <Input name="displayName" placeholder="Operating bank account" required />
        </RecordField>
        <RecordField error={state.fieldErrors?.code?.[0]} hint={<p className="mt-1 text-xs text-muted-foreground">Stable uppercase identifier used by checked Finance workflows.</p>} label="Code" name="code" required>
          <Input className="font-mono uppercase" name="code" placeholder="OPERATING_BANK" required />
        </RecordField>
        <RecordField error={state.fieldErrors?.maskedReference?.[0]} hint={<p className="mt-1 text-xs text-muted-foreground">Use a masked label only. Do not enter a full account number.</p>} label="Masked reference" name="maskedReference">
          <Input name="maskedReference" placeholder="Ending 4821" />
        </RecordField>
      </FormSection>
      <FormSection title="Classification">
        <RecordField error={state.fieldErrors?.sourceKind?.[0]} label="Source type" name="sourceKind" required>
          <SelectControl
            defaultValue="bank"
            name="sourceKind"
            options={Object.entries(sourceKindLabels).map(([value, label]) => ({ label, value }))}
            required
          />
        </RecordField>
        <RecordField error={state.fieldErrors?.scopeKind?.[0]} label="Scope" name="scopeKind" required>
          <SelectControl
            name="scopeKind"
            onValueChange={(value) => setScopeKind(value as FinanceSourceScopeKind)}
            options={Object.entries(scopeKindLabels).map(([value, label]) => ({ label, value }))}
            required
            value={scopeKind}
          />
        </RecordField>
        {scopeKind === "property_dedicated" ? (
          <RecordField error={state.fieldErrors?.propertyId?.[0]} label="Dedicated property" name="propertyId" required>
            <SelectControl
              name="propertyId"
              options={[
                { label: "Choose property", value: "" },
                ...properties.map((property) => ({
                  label: property.label,
                  value: property.id,
                })),
              ]}
              required
            />
          </RecordField>
        ) : null}
      </FormSection>
    </RecordForm>
  );
}

function ManageSourceForm({
  onClose,
  source,
}: {
  onClose: () => void;
  source: FinanceSourceSummary;
}) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateFinanceSourceAction,
    actionInitialState,
  );
  const lifecycleAction = source.archivedAt
    ? restoreFinanceSourceAction
    : archiveFinanceSourceAction;
  const [lifecycleState, lifecycleFormAction, lifecyclePending] = useActionState(
    lifecycleAction,
    actionInitialState,
  );

  return (
    <div className="flex min-h-full flex-col">
      <RecordForm
        action={updateAction}
        ariaLabel="Update funding source form"
        className="min-h-0 flex-1"
        onCancel={onClose}
        pending={updatePending}
        saveLabel="Save details"
        savingLabel="Saving details"
        state={updateState}
      >
        <input name="sourceId" type="hidden" value={source.id} />
        <ConsequencePanel
          rows={[
            { label: "Code", value: <span className="font-mono">{source.code}</span> },
            { label: "Type", value: sourceKindLabels[source.sourceKind] },
            { label: "Currency", value: source.currency },
            {
              label: "Scope",
              value:
                source.propertyLabel ?? scopeKindLabels[source.scopeKind],
            },
          ]}
          summary="Code, type, currency, and scope stay fixed once the source is used. Historical activity always keeps this source identity."
          title="Locked operational identity"
        />
        <FormSection title="Editable details">
          <RecordField error={updateState.fieldErrors?.displayName?.[0]} label="Name" name="displayName" required>
            <Input defaultValue={source.displayName} name="displayName" required />
          </RecordField>
          <RecordField error={updateState.fieldErrors?.maskedReference?.[0]} hint={<p className="mt-1 text-xs text-muted-foreground">Use a masked label only. Do not enter a full account number.</p>} label="Masked reference" name="maskedReference">
            <Input defaultValue={source.maskedReference ?? ""} name="maskedReference" />
          </RecordField>
        </FormSection>
      </RecordForm>

      <form action={lifecycleFormAction} className="border-t border-border px-4 py-4 sm:px-5">
        <input name="sourceId" type="hidden" value={source.id} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {source.archivedAt ? "Return to active use" : "Stop future use"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {source.archivedAt
                ? "Restoring makes this source selectable again."
                : "Archiving removes this source from new transactions without deleting history."}
            </p>
            {lifecycleState.message ? (
              <p
                className="mt-2 text-xs"
                role={lifecycleState.status === "error" ? "alert" : "status"}
              >
                {lifecycleState.message}
              </p>
            ) : null}
          </div>
          <Button
            aria-label={source.archivedAt ? "Restore funding source" : "Archive funding source"}
            disabled={lifecyclePending}
            type="submit"
            variant="outline"
          >
            {source.archivedAt ? (
              <RotateCcw aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            {lifecyclePending
              ? "Saving"
              : source.archivedAt
                ? "Restore"
                : "Archive"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer?.mode === "create") {
    return "Add a real bank, cash, clearing, petty-cash, or other operational source.";
  }
  if (drawer?.mode === "manage") {
    return "Rename the source, update its masked reference, or change its active lifecycle.";
  }
  return undefined;
}
