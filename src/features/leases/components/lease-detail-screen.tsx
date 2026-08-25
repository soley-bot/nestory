"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { DocumentForm } from "@/features/documents/components/document-screen";
import {
  ArchiveLeasePanel,
  RestoreLeasePanel,
} from "@/features/leases/components/lease-drawer-panels";
import { LeaseDetailView } from "@/features/leases/components/lease-detail-view";
import { LeasePaymentResolutionView } from "@/features/leases/components/lease-payment-resolution-view";
import { LeaseBillingRuleFields } from "@/features/leases/components/lease-billing-rule-fields";
import { LeaseForm } from "@/features/leases/components/lease-form";
import {
  cancelLeaseActivationAction,
  scheduleLeaseActivationAction,
  scheduleFutureRentTermAction,
  saveLeaseBillingRulesAction,
  transitionLeaseLifecycleAction,
  type LeaseActionState,
} from "@/features/leases/actions";
import type { LeasePaymentResolutionData } from "@/features/finance-operations/finance-operations.types";
import {
  buildLeaseRecordHref,
  type LeaseRecordSection,
} from "@/features/leases/lease-detail-route";
import type {
  LeasePropertyOption,
  LeaseBillingFormConfig,
  LeaseSummary,
  LeaseTenantOption,
  LeaseTermContext,
  LeaseUnitOption,
} from "@/features/leases/lease.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";

type LeaseTransition =
  | "activate"
  | "cancel"
  | "end"
  | "give_notice"
  | "terminate";
type LeaseTermChange = "renewal" | "rent_change";

type DrawerState =
  | { mode: "archive" }
  | { mode: "billing" }
  | { mode: "edit" }
  | { mode: "restore" };

export type LeaseActionPermissions = {
  canActivate: boolean;
  canArchive: boolean;
  canChangeTerms: boolean;
  canClose: boolean;
  canPrepare: boolean;
};

type LeaseRouteNotice = {
  href?: string;
  linkLabel?: string;
  message: string;
};

type LeasePaymentFocusProps = {
  canRecordPayments: boolean;
  canViewFinance: boolean;
  paymentResolution?: LeasePaymentResolutionData;
  routeNotice?: LeaseRouteNotice;
};

const initialActionState: LeaseActionState = {};

export function LeaseDetailScreen({
  activeSection,
  billingFormConfig,
  canRecordPayments,
  canViewFinance,
  lease,
  paymentResolution,
  permissions,
  propertyOptions,
  routeNotice,
  tenantOptions,
  unitOptions,
}: {
  activeSection: LeaseRecordSection;
  billingFormConfig?: LeaseBillingFormConfig;
  lease: LeaseSummary;
  permissions: LeaseActionPermissions;
  propertyOptions: LeasePropertyOption[];
  tenantOptions: LeaseTenantOption[];
  unitOptions: LeaseUnitOption[];
} & LeasePaymentFocusProps) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [transition, setTransition] = useState<LeaseTransition | null>(null);
  const [termChange, setTermChange] = useState<LeaseTermChange | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    routeNotice?.message ?? null,
  );
  const returnHref = buildLeaseRecordHref({ leaseId: lease.id });
  const currentOccupancy =
    lease.occupancies.find(
      (occupancy) => occupancy.evidenceState === "accepted",
    ) ??
    lease.occupancies[0] ??
    null;
  const activeTerm =
    lease.terms.find((term) => term.status === "active") ?? null;

  const openDrawer = (nextDrawer: DrawerState) => {
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };

  const handlePaymentSuccess = (message: string) => {
    setStatusMessage(message);
    router.replace(returnHref);
    router.refresh();
  };

  return (
    <div className="lg:flex lg:flex-col">
      <PageHeader
        actions={
          <LeaseHeaderActions
            lease={lease}
            onArchive={() => openDrawer({ mode: "archive" })}
            onEditDraft={() => openDrawer({ mode: "edit" })}
            onLifecycleChange={setTransition}
            onRestore={() => openDrawer({ mode: "restore" })}
            onScheduleTerm={setTermChange}
            permissions={permissions}
            focused={Boolean(paymentResolution)}
          />
        }
        breadcrumb={
          <PageBreadcrumb
            current={lease.tenantName}
            items={[
              { href: "/properties", label: "Properties" },
              {
                href: lease.hrefs.property,
                label: `${lease.propertyCode} — ${lease.propertyName}`,
              },
              ...(lease.unitId && lease.hrefs.unit
                ? [
                    {
                      href: lease.hrefs.unit,
                      label: lease.unitLabel.split(" / ")[0] ?? lease.unitLabel,
                    },
                  ]
                : []),
            ]}
          />
        }
        className="pb-3"
        context={
          <div className="flex items-center gap-2">
            <Badge tone={lease.statusTone}>{lease.statusLabel}</Badge>
            {lease.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        }
        description={
          paymentResolution
            ? `${lease.propertyName} · ${lease.startDateLabel}–${lease.endDateLabel}`
            : `${lease.propertyName} / ${lease.unitLabel}`
        }
        title={
          paymentResolution
            ? `${lease.tenantName} — ${lease.unitLabel.split(" / ")[0] ?? lease.unitLabel}`
            : lease.tenantName
        }
      />

      {statusMessage ? (
        <div className="workspace-gutter-x pb-3">
          <p className="border-y border-border py-2 text-sm" role="status">
            {statusMessage}
            {routeNotice?.href &&
            routeNotice.linkLabel &&
            statusMessage === routeNotice.message ? (
              <Link
                className="ml-2 font-medium text-primary underline-offset-2 hover:underline"
                href={routeNotice.href}
              >
                {routeNotice.linkLabel}
              </Link>
            ) : null}
          </p>
        </div>
      ) : null}

      {!paymentResolution && lease.activationSchedule ? (
        <ScheduledActivationNotice
          canCancel={permissions.canActivate}
          lease={lease}
          onSuccess={setStatusMessage}
        />
      ) : null}

      {paymentResolution ? (
        <LeasePaymentResolutionView
          canRecordPayments={canRecordPayments}
          canViewFinance={canViewFinance}
          lease={lease}
          onPaymentSuccess={handlePaymentSuccess}
          onReceiptResult={() => undefined}
          resolution={paymentResolution}
          returnHref={returnHref}
        />
      ) : (
        <LeaseDetailView
          activeSection={activeSection}
          permissions={permissions}
          lease={lease}
          onAttachFile={() => {
            setStatusMessage(null);
            setUploadOpen(true);
          }}
          onChangeBillingRules={() => openDrawer({ mode: "billing" })}
          onLifecycleChange={(nextTransition) => {
            setStatusMessage(null);
            if (!currentOccupancy) {
              setStatusMessage(
                "Confirm the current resident and move-in before changing the lease.",
              );
              return;
            }
            setTransition(nextTransition);
          }}
          onScheduleTerm={(mode) => {
            setStatusMessage(null);
            if (!activeTerm) {
              setStatusMessage(
                "Add a current rent schedule before changing rent or renewing the lease.",
              );
              return;
            }
            setTermChange(mode);
          }}
        />
      )}

      {drawer ? (
        <SideDrawer
          description={getDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" ? (
            <ArchiveLeasePanel
              lease={lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "restore" ? (
            <RestoreLeasePanel
              lease={lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "billing" ? (
            <LeaseBillingRulesForm
              billingFormConfig={billingFormConfig}
              lease={lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <LeaseForm
              billingFormConfig={billingFormConfig}
              key={`edit-${lease.id}`}
              lease={lease}
              mode="edit"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              tenants={tenantOptions}
              units={unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}

      {transition && currentOccupancy ? (
        transition === "activate" ? (
          <LeaseActivationModal
            lease={lease}
            occupancyId={currentOccupancy.id}
            onClose={() => setTransition(null)}
            onSuccess={(message) => {
              setStatusMessage(message);
              setTransition(null);
            }}
          />
        ) : (
          <LeaseTransitionModal
          lease={lease}
          occupancyId={currentOccupancy.id}
          onClose={() => setTransition(null)}
          onSuccess={(message) => {
            setStatusMessage(message);
            setTransition(null);
          }}
          transition={transition}
          />
        )
      ) : null}

      {termChange && activeTerm ? (
        <LeaseTermModal
          lease={lease}
          mode={termChange}
          onClose={() => setTermChange(null)}
          onSuccess={(message) => {
            setStatusMessage(message);
            setTermChange(null);
          }}
          term={activeTerm}
        />
      ) : null}

      {uploadOpen ? (
        <Modal
          onClose={() => setUploadOpen(false)}
          open
          title="Upload lease file"
        >
          <DocumentForm
            fixedPropertyId={lease.formValues.propertyId}
            fixedUnitId={lease.formValues.unitId ?? undefined}
            initialValues={{
              category: "Lease",
              leaseId: lease.id,
              propertyId: lease.formValues.propertyId,
              unitId: lease.formValues.unitId,
            }}
            mode="create"
            onClose={() => setUploadOpen(false)}
            onSuccess={(message) => {
              setStatusMessage(message);
              router.refresh();
            }}
            properties={propertyOptions}
            units={unitOptions}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function LeaseHeaderActions({
  focused,
  lease,
  onArchive,
  onEditDraft,
  onLifecycleChange,
  onRestore,
  onScheduleTerm,
  permissions,
}: {
  focused: boolean;
  lease: LeaseSummary;
  onArchive: () => void;
  onEditDraft: () => void;
  onLifecycleChange: (transition: LeaseTransition) => void;
  onRestore: () => void;
  onScheduleTerm: (mode: LeaseTermChange) => void;
  permissions: LeaseActionPermissions;
}) {
  const canManageActive =
    lease.statusValue === "active" &&
    (permissions.canChangeTerms || permissions.canClose);
  const canManageNotice =
    lease.statusValue === "notice_given" && permissions.canClose;
  const hasFocusedAction = lease.isArchived
    ? permissions.canArchive
    : lease.statusValue === "draft"
      ? permissions.canPrepare || permissions.canArchive
      : canManageActive || canManageNotice || permissions.canArchive;

  if (focused && hasFocusedAction) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default">
            More
            <MoreHorizontal aria-hidden size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {lease.isArchived && permissions.canArchive ? (
            <DropdownMenuItem onSelect={onRestore}>Restore</DropdownMenuItem>
          ) : null}
          {lease.statusValue === "draft" && permissions.canPrepare ? (
            <DropdownMenuItem onSelect={onEditDraft}>Edit draft</DropdownMenuItem>
          ) : null}
          {permissions.canChangeTerms && lease.statusValue === "active" ? (
            <DropdownMenuItem onSelect={() => onScheduleTerm("rent_change")}>
              Change rent
            </DropdownMenuItem>
          ) : null}
          {permissions.canClose && lease.statusValue === "active" ? (
            <DropdownMenuItem onSelect={() => onLifecycleChange("give_notice")}>
              Record notice
            </DropdownMenuItem>
          ) : null}
          {permissions.canClose &&
          ["active", "notice_given"].includes(lease.statusValue) ? (
            <>
              <DropdownMenuItem onSelect={() => onLifecycleChange("end")}>
                Complete move-out
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onLifecycleChange("terminate")}
                variant="destructive"
              >
                Terminate lease
              </DropdownMenuItem>
            </>
          ) : null}
          {!lease.isArchived && permissions.canArchive ? (
            <DropdownMenuItem onSelect={onArchive} variant="destructive">
              Archive
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (lease.isArchived) {
    return permissions.canArchive ? (
      <Button onClick={onRestore} variant="default">
        <RotateCcw aria-hidden size={15} /> Restore
      </Button>
    ) : null;
  }

  if (lease.statusValue === "draft") {
    return (
      <>
        {permissions.canPrepare ? (
          <Button onClick={onEditDraft} variant="default">
            <Pencil aria-hidden size={15} /> Edit draft
          </Button>
        ) : null}
        {permissions.canArchive ? (
          <Button onClick={onArchive} variant="outline">
            <Archive aria-hidden size={15} /> Archive
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <>
      {canManageActive || canManageNotice ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default">
              Manage lease
              <MoreHorizontal aria-hidden size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {permissions.canChangeTerms && lease.statusValue === "active" ? (
              <DropdownMenuItem onSelect={() => onScheduleTerm("rent_change")}>
                Change rent
              </DropdownMenuItem>
            ) : null}
            {permissions.canClose && lease.statusValue === "active" ? (
              <DropdownMenuItem onSelect={() => onLifecycleChange("give_notice")}>
                Record notice
              </DropdownMenuItem>
            ) : null}
            {permissions.canClose &&
            ["active", "notice_given"].includes(lease.statusValue) ? (
              <>
                <DropdownMenuItem onSelect={() => onLifecycleChange("end")}>
                  Complete move-out
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onLifecycleChange("terminate")}
                  variant="destructive"
                >
                  Terminate lease
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {permissions.canArchive ? (
        <Button onClick={onArchive} variant="outline">
          <Archive aria-hidden size={15} /> Archive
        </Button>
      ) : null}
    </>
  );
}

function LeaseBillingRulesForm({
  billingFormConfig,
  lease,
  onClose,
  onSuccess,
}: {
  billingFormConfig?: LeaseBillingFormConfig;
  lease: LeaseSummary;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    saveLeaseBillingRulesAction,
    initialActionState,
  );
  const [idempotencyKey] = useState(
    () => `lease-billing:${lease.id}:${crypto.randomUUID()}`,
  );
  const currentRule =
    lease.billingRules.find((rule) => rule.state === "current") ??
    lease.billingRules.find((rule) => rule.state === "scheduled") ??
    null;

  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(state.message ?? "Billing rules saved.");
    onClose();
    router.refresh();
  }, [onClose, onSuccess, router, state.message, state.status]);

  return (
    <form action={action} className="space-y-4 p-4">
      <input name="leaseId" type="hidden" value={lease.id} />
      <input
        name="expectedCurrentBillingRuleId"
        type="hidden"
        value={currentRule?.id ?? ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

      <div className="border-l-2 border-foreground pl-3">
        <p className="font-medium text-foreground">{lease.tenantName}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {lease.propertyName} / {lease.unitLabel}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Begins with the next unbilled month.
      </p>
      <LeaseBillingRuleFields
        companyOptions={billingFormConfig?.companyOptions}
        defaults={currentRule}
        fieldErrors={state.fieldErrors}
        operationalTimezone={
          billingFormConfig?.operationalTimezone ??
          currentRule?.rentCalculationTimezone ??
          "UTC"
        }
        organizationName={billingFormConfig?.organizationName ?? "our company"}
        tenantRecipient={{
          id: lease.formValues.tenantPersonId,
          label: lease.tenantName,
          partyType: billingFormConfig?.companyOptions.some(
            (option) => option.id === lease.formValues.tenantPersonId,
          )
            ? "company"
            : "individual",
        }}
      />
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-sm text-danger"
              : "text-sm text-muted-foreground"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : "Save billing rules"}
        </Button>
      </div>
    </form>
  );
}

function LeaseTermModal({
  lease,
  mode,
  onClose,
  onSuccess,
  term,
}: {
  lease: LeaseSummary;
  mode: LeaseTermChange;
  onClose: () => void;
  onSuccess: (message: string) => void;
  term: LeaseTermContext;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    scheduleFutureRentTermAction,
    initialActionState,
  );
  const [idempotencyKey] = useState(
    () => `lease-term:${lease.id}:${mode}:${crypto.randomUUID()}`,
  );
  const defaults = getTermChangeDefaults(mode, term);
  const copy =
    mode === "renewal"
      ? {
          endDateLabel: "Renewal end date",
          startDateLabel: "Renewal start date",
          submitLabel: "Renew lease",
          successMessage: "Lease renewal scheduled.",
          title: "Renew lease",
        }
      : {
          endDateLabel: "Term end date",
          startDateLabel: "Effective date",
          submitLabel: "Change rent",
          successMessage: "Rent change scheduled.",
          title: "Change rent",
        };

  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(state.message ?? copy.successMessage);
    router.refresh();
  }, [copy.successMessage, onSuccess, router, state.message, state.status]);

  return (
    <Modal onClose={onClose} open title={copy.title}>
      <form action={formAction} className="space-y-5 p-4">
        <input name="leaseId" type="hidden" value={lease.id} />
        <input name="supersedesTermId" type="hidden" value={term.id} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />


        <div className="border-l-2 border-foreground pl-3">
          <p className="font-medium text-foreground">{lease.tenantName}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lease.propertyName} / {lease.unitLabel}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            {copy.startDateLabel}
            <DatePickerField
              ariaLabel={copy.startDateLabel}
              defaultValue={defaults.startDate}
              name="startDate"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {copy.endDateLabel}
            <DatePickerField
              ariaLabel={copy.endDateLabel}
              defaultValue={defaults.endDate}
              name="endDate"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Rent amount
            <NumberInput
              defaultValue={term.rentAmount}
              min="0"
              name="rentAmount"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Rent due day
            <NumberInput
              defaultValue={term.rentDueDay ?? undefined}
              max="31"
              min="1"
              name="rentDueDay"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Payment frequency
            <SelectControl
              ariaLabel="Payment frequency"
              defaultValue={term.paymentFrequency ?? "monthly"}
              name="paymentFrequency"
              options={[
                { label: "Monthly", value: "monthly" },
                { label: "Quarterly", value: "quarterly" },
                { label: "Semi-annual", value: "semi_annual" },
                { label: "Annual", value: "annual" },
                { label: "One time", value: "one_time" },
              ]}
              required
            />
          </label>
        </div>

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "text-sm text-danger"
                : "text-sm text-muted-foreground"
            }
            role="status"
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending ? "Saving..." : copy.submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "archive") return "Archive lease";
  if (drawer.mode === "billing") return "Change billing rules";
  if (drawer.mode === "restore") return "Restore lease";
  return "Edit draft";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "archive")
    return "Archive this record without deleting its history.";
  if (drawer.mode === "billing")
    return "Schedule the replacement after all generated invoice months.";
  if (drawer.mode === "restore")
    return "Review whether this lease can return to active views.";
  return "Update the draft period, rent, or deposit before activation.";
}

function LeaseTransitionModal({
  lease,
  occupancyId,
  onClose,
  onSuccess,
  transition,
}: {
  lease: LeaseSummary;
  occupancyId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  transition: LeaseTransition;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    transitionLeaseLifecycleAction,
    initialActionState,
  );
  const today = getBusinessDateValue();
  const [idempotencyKey] = useState(
    () => `lease-lifecycle:${lease.id}:${transition}:${crypto.randomUUID()}`,
  );
  const copy = getTransitionCopy(transition);

  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(state.message ?? copy.successMessage);
    router.refresh();
  }, [copy.successMessage, onSuccess, router, state.message, state.status]);

  return (
    <Modal onClose={onClose} open title={copy.title}>
      <form action={formAction} className="space-y-4 p-4">
        <input name="leaseId" type="hidden" value={lease.id} />
        <input name="expectedStatus" type="hidden" value={lease.statusValue} />
        <input name="expectedOccupancyId" type="hidden" value={occupancyId} />
        <input name="transition" type="hidden" value={transition} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

        <div className="grid gap-1.5 text-sm font-medium">
          <span>{copy.effectiveDateLabel}</span>
          <DatePickerField
            ariaLabel={copy.effectiveDateLabel}
            defaultValue={today}
            name="effectiveDate"
            required
          />
          <FieldError errors={state.fieldErrors?.effectiveDate} />
        </div>

        {transition === "give_notice" ? (
          <div className="grid gap-1.5 text-sm font-medium">
            <span>Planned move-out date</span>
            <DatePickerField
              ariaLabel="Planned move-out date"
              name="scheduledMoveOutDate"
              required
            />
            <FieldError errors={state.fieldErrors?.scheduledMoveOutDate} />
          </div>
        ) : (
          <input name="scheduledMoveOutDate" type="hidden" value="" />
        )}

        <label className="grid gap-1.5 text-sm font-medium">
          Reason or note
          <textarea
            aria-label="Reason or note"
            className="min-h-24 resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
            name="reason"
            required
          />
          <FieldError errors={state.fieldErrors?.reason} />
        </label>

        {state.status === "error" && state.message ? (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending ? "Saving..." : copy.submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ScheduledActivationNotice({
  canCancel,
  lease,
  onSuccess,
}: {
  canCancel: boolean;
  lease: LeaseSummary;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    cancelLeaseActivationAction,
    initialActionState,
  );
  const schedule = lease.activationSchedule;

  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(state.message ?? "Scheduled activation cancelled.");
    router.refresh();
  }, [onSuccess, router, state.message, state.status]);

  if (!schedule) return null;
  return (
    <div className="workspace-gutter-x pb-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div>
          <p className="text-sm font-medium">
            {schedule.status === "pending"
              ? `Activation scheduled for ${formatDate(schedule.activationDate)}`
              : "Scheduled activation needs attention"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {schedule.status === "pending"
              ? "The Lease stays Draft until that date."
              : schedule.failureMessage ?? "Review the Lease and activate it again."}
          </p>
        </div>
        {canCancel && schedule.status === "pending" ? (
          <form action={action}>
            <input name="leaseId" type="hidden" value={lease.id} />
            <input name="scheduleId" type="hidden" value={schedule.id} />
            <Button disabled={pending} type="submit" variant="outline">
              {pending ? "Cancelling..." : "Cancel scheduled activation"}
            </Button>
          </form>
        ) : null}
      </div>
      {state.status === "error" && state.message ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function LeaseActivationModal({
  lease,
  occupancyId,
  onClose,
  onSuccess,
}: {
  lease: LeaseSummary;
  occupancyId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    scheduleLeaseActivationAction,
    initialActionState,
  );
  const today = getBusinessDateValue();
  const [activationMode, setActivationMode] = useState("today");
  const [idempotencyKey] = useState(
    () => `lease-activation:${lease.id}:${crypto.randomUUID()}`,
  );

  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(state.message ?? "Lease activation saved.");
    router.refresh();
  }, [onSuccess, router, state.message, state.status]);

  return (
    <Modal onClose={onClose} open title="Activate lease">
      <form action={formAction} className="space-y-5 p-4">
        <input name="leaseId" type="hidden" value={lease.id} />
        <input name="expectedStatus" type="hidden" value="draft" />
        <input name="expectedOccupancyId" type="hidden" value={occupancyId} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />


        <div className="border-l-2 border-foreground pl-3">
          <p className="font-medium text-foreground">{lease.tenantName}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lease.propertyName} / {lease.unitLabel}
          </p>
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          Activation timing
          <SelectControl
            ariaLabel="Activation timing"
            onValueChange={setActivationMode}
            options={[
              { label: "Activate today", value: "today" },
              { label: "Activate on date", value: "scheduled" },
            ]}
            value={activationMode}
          />
        </label>

        {activationMode === "scheduled" ? (
          <div className="grid gap-1.5 text-sm font-medium">
            <span>Activation date</span>
            <DatePickerField
              ariaLabel="Activation date"
              defaultValue={today}
              name="activationDate"
              required
            />
            <FieldError errors={state.fieldErrors?.activationDate} />
          </div>
        ) : (
          <input name="activationDate" type="hidden" value={today} />
        )}

        {state.status === "error" && state.message ? (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending ? "Saving..." : "Activate lease"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? (
    <span className="text-xs font-normal text-danger">{errors[0]}</span>
  ) : null;
}

function getTransitionCopy(transition: LeaseTransition) {
  if (transition === "activate") {
    return {
      effectiveDateLabel: "Activation date",
      submitLabel: "Activate lease",
      successMessage: "Lease activated.",
      title: "Activate lease",
    };
  }

  if (transition === "give_notice") {
    return {
      effectiveDateLabel: "Notice date",
      submitLabel: "Record notice",
      successMessage: "Notice recorded.",
      title: "Record notice",
    };
  }

  if (transition === "cancel") {
    return {
      effectiveDateLabel: "Cancellation date",
      submitLabel: "Cancel draft",
      successMessage: "Draft lease cancelled.",
      title: "Cancel draft",
    };
  }

  if (transition === "end") {
    return {
      effectiveDateLabel: "Move-out date",
      submitLabel: "Complete move-out",
      successMessage: "Move-out completed.",
      title: "Complete move-out",
    };
  }

  return {
    effectiveDateLabel: "Termination date",
    submitLabel: "Terminate lease",
    successMessage: "Lease terminated.",
    title: "Terminate lease",
  };
}

function getTermChangeDefaults(mode: LeaseTermChange, term: LeaseTermContext) {
  if (mode === "renewal") {
    const startDate = addDaysIso(term.endDate, 1);
    const nextYear = new Date(`${startDate}T00:00:00.000Z`);
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);

    return {
      endDate: addDaysIso(nextYear.toISOString().slice(0, 10), -1),
      startDate,
    };
  }

  return {
    endDate: term.endDate,
    startDate: "",
  };
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
