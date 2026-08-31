"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
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
import { Input } from "@/components/ui/input";
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
  recordLeaseDepositEventAction,
  reverseLeaseDepositEventAction,
  scheduleLeaseActivationAction,
  scheduleFutureRentTermAction,
  saveLeaseBillingRulesAction,
  transitionLeaseLifecycleAction,
  type LeaseActionState,
} from "@/features/leases/actions";
import { retryTenantReceiptPdfAction } from "@/features/finance-operations/actions";
import type { TenantPaymentReceiptResult } from "@/features/finance-operations/components/tenant-invoice-payment-form";
import type {
  FinanceOperationsActionState,
  LeasePaymentResolutionData,
} from "@/features/finance-operations/finance-operations.types";
import {
  buildLeaseRecordHref,
  type LeaseRecordSection,
} from "@/features/leases/lease-detail-route";
import type {
  LeasePropertyOption,
  LeaseBillingFormConfig,
  LeaseDepositContext,
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
  | { mode: "deposit" }
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
const initialFinanceActionState: FinanceOperationsActionState = {};

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
  const pendingPaymentReceiptRef = useRef<TenantPaymentReceiptResult | null>(
    null,
  );
  const returnHref = buildLeaseRecordHref({ leaseId: lease.id });
  const statusScope = paymentResolution
    ? `${lease.id}:payment:${paymentResolution.invoice.id}`
    : `${lease.id}:record:${activeSection}:${routeNotice?.message ?? ""}:${routeNotice?.href ?? ""}`;
  const returnStatusScope = `${lease.id}:record:overview::`;
  const [localStatus, setLocalStatus] = useState<{
    hasBeenShown: boolean;
    message: string;
    receiptResult?: TenantPaymentReceiptResult;
    scope: string;
  } | null>(null);
  const [previousStatusScope, setPreviousStatusScope] = useState(statusScope);
  if (previousStatusScope !== statusScope) {
    setPreviousStatusScope(statusScope);
    setLocalStatus((currentStatus) => {
      if (!currentStatus) return null;
      if (currentStatus.scope === statusScope) {
        return { ...currentStatus, hasBeenShown: true };
      }
      if (currentStatus.hasBeenShown || !paymentResolution) return null;
      return currentStatus;
    });
  }
  const localStatusMessage =
    localStatus?.scope === statusScope ? localStatus.message : null;
  const localReceiptResult =
    localStatus?.scope === statusScope
      ? (localStatus.receiptResult ?? null)
      : null;
  const statusMessage = localStatusMessage ?? routeNotice?.message ?? null;
  const currentOccupancy =
    lease.occupancies.find(
      (occupancy) => occupancy.evidenceState === "accepted",
    ) ??
    lease.occupancies[0] ??
    null;
  const activeTerm =
    lease.terms.find((term) => term.status === "active") ?? null;

  const setStatusMessage = (message: string | null) => {
    setLocalStatus(
      message ? { hasBeenShown: true, message, scope: statusScope } : null,
    );
  };

  const openDrawer = (nextDrawer: DrawerState) => {
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };

  const handlePaymentSuccess = (message: string) => {
    const receiptResult = pendingPaymentReceiptRef.current;
    pendingPaymentReceiptRef.current = null;
    setLocalStatus({
      hasBeenShown: false,
      message,
      ...(receiptResult ? { receiptResult } : {}),
      scope: returnStatusScope,
    });
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
            returnHref={returnHref}
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
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border py-2 text-sm"
            role="status"
          >
            <span>{statusMessage}</span>
            {routeNotice?.href &&
            routeNotice.linkLabel &&
            !localStatusMessage ? (
              <Link
                className="ml-2 font-medium text-primary underline-offset-2 hover:underline"
                href={routeNotice.href}
              >
                {routeNotice.linkLabel}
              </Link>
            ) : null}
            {localReceiptResult ? (
              <LeasePaymentReceiptAction
                canRetry={canRecordPayments}
                result={localReceiptResult}
              />
            ) : null}
          </div>
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
          onReceiptResult={(result) => {
            pendingPaymentReceiptRef.current = result;
          }}
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
          onManageDeposit={() => openDrawer({ mode: "deposit" })}
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
          ) : drawer.mode === "deposit" ? (
            <LeaseDepositPanel
              canManage={permissions.canChangeTerms && !lease.isArchived}
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

function LeaseDepositPanel({
  canManage,
  lease,
  onClose,
  onSuccess,
}: {
  canManage: boolean;
  lease: LeaseSummary;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [depositState, recordDepositEvent, depositPending] = useActionState(
    recordLeaseDepositEventAction,
    initialActionState,
  );
  const [reversalState, reverseDepositEvent, reversalPending] = useActionState(
    reverseLeaseDepositEventAction,
    initialActionState,
  );

  useEffect(() => {
    const successState =
      depositState.status === "success"
        ? depositState
        : reversalState.status === "success"
          ? reversalState
          : null;
    if (!successState) return;

    onSuccess(successState.message ?? "Security deposit updated.");
    onClose();
    router.refresh();
  }, [depositState, onClose, onSuccess, reversalState, router]);

  if (!lease.deposits.length) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        No security deposit is recorded for this lease.
      </p>
    );
  }

  return (
    <div className="space-y-7 p-5">
      <div className="border-l-2 border-foreground pl-3">
        <p className="font-medium text-foreground">{lease.tenantName}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {lease.propertyName} / {lease.unitLabel}
        </p>
      </div>

      {lease.deposits.map((deposit) => {
        const activityOptions = getDepositActivityOptions(deposit);

        return (
          <section className="space-y-4" key={deposit.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-semibold">{deposit.typeLabel}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Required <MoneyDisplay value={deposit.amountDisplay} /> · Held{" "}
                  <MoneyDisplay value={deposit.heldBalanceDisplay} />
                </p>
              </div>
              <Badge tone="neutral">{deposit.statusLabel}</Badge>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                History
              </p>
              {deposit.events.length ? (
                <div className="mt-2 divide-y divide-border border-y border-border">
                  {deposit.events.map((event) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                      key={event.id}
                    >
                      <span>
                        {getDepositActivityLabel(event.eventType)} on{" "}
                        {formatDate(event.eventDate)} ·{" "}
                        <MoneyDisplay value={event.amountDisplay} />
                        {event.reference ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {event.reference}
                          </span>
                        ) : null}
                      </span>
                      {canManage && event.reversible ? (
                        <form action={reverseDepositEvent}>
                          <input name="eventId" type="hidden" value={event.id} />
                          <input
                            name="eventDate"
                            type="hidden"
                            value={getBusinessDateValue()}
                          />
                          <Button
                            disabled={reversalPending}
                            size="sm"
                            type="submit"
                            variant="outline"
                          >
                            Undo entry
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No deposit changes recorded.
                </p>
              )}
            </div>

            {canManage && activityOptions.length ? (
              <form
                action={recordDepositEvent}
                className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2"
              >
                <input
                  name="leaseDepositId"
                  type="hidden"
                  value={deposit.id}
                />
                <DepositField label="Activity">
                  <SelectControl
                    ariaLabel="Deposit activity"
                    defaultValue={activityOptions[0]?.value}
                    name="eventType"
                    options={activityOptions}
                  />
                </DepositField>
                <DepositField label="Date">
                  <DatePickerField
                    ariaLabel="Deposit activity date"
                    defaultValue={getBusinessDateValue()}
                    name="eventDate"
                  />
                </DepositField>
                <DepositField label="Amount">
                  <NumberInput name="amount" required />
                </DepositField>
                <DepositField label="Receipt or note">
                  <Input name="reference" />
                </DepositField>
                <div className="flex justify-end sm:col-span-2">
                  <Button disabled={depositPending} type="submit">
                    {depositPending ? "Saving..." : "Save deposit activity"}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>
        );
      })}

      <DepositActionMessage state={depositState} />
      <DepositActionMessage state={reversalState} />
    </div>
  );
}

function DepositField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function DepositActionMessage({ state }: { state: LeaseActionState }) {
  return state.message ? (
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
  ) : null;
}

function getDepositActivityOptions(deposit: LeaseDepositContext) {
  return [
    ...(deposit.amountCents > 0 && deposit.heldBalanceCents < deposit.amountCents
      ? [{ label: "Deposit received", value: "received" }]
      : []),
    ...(deposit.heldBalanceCents > 0
      ? [
          { label: "Deposit retained", value: "retained" },
          { label: "Deposit refunded", value: "refunded" },
        ]
      : []),
  ];
}

function getDepositActivityLabel(eventType: string) {
  if (eventType === "received") return "Deposit received";
  if (eventType === "applied") return "Deposit used";
  if (eventType === "retained") return "Deposit retained";
  if (eventType === "refunded") return "Deposit refunded";
  return "Deposit updated";
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
  returnHref,
}: {
  focused: boolean;
  lease: LeaseSummary;
  onArchive: () => void;
  onEditDraft: () => void;
  onLifecycleChange: (transition: LeaseTransition) => void;
  onRestore: () => void;
  onScheduleTerm: (mode: LeaseTermChange) => void;
  permissions: LeaseActionPermissions;
  returnHref: string;
}) {
  const canManageActive =
    lease.statusValue === "active" &&
    (permissions.canChangeTerms || permissions.canClose);
  const canManageNotice =
    lease.statusValue === "notice_given" && permissions.canClose;
  if (focused) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            More
            <MoreHorizontal aria-hidden size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem asChild>
            <Link href={returnHref}>Open full lease record</Link>
          </DropdownMenuItem>
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
  const predecessorRule =
    lease.billingRules.find((rule) => rule.state === "current") ??
    lease.billingRules.find((rule) => rule.state === "scheduled") ??
    null;
  const editableRule =
    lease.billingRules.find((rule) => rule.state === "scheduled") ??
    predecessorRule;
  const billingPreviewTerms = lease.terms.filter(
    (term) => term.status !== "superseded",
  );
  const firstLeaseTerm = billingPreviewTerms.reduce<LeaseTermContext | null>(
    (first, term) =>
      first === null || term.startDate < first.startDate ? term : first,
    null,
  );
  const finalLeaseTerm = billingPreviewTerms.reduce<LeaseTermContext | null>(
    (final, term) =>
      final === null || term.endDate > final.endDate ? term : final,
    null,
  );
  const finalMonthOpeningTerm = getOpeningTermForMonth(
    billingPreviewTerms,
    finalLeaseTerm?.endDate ?? lease.formValues.leaseEndDate,
  );

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
        value={predecessorRule?.id ?? ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

      <div className="border-l-2 border-foreground pl-3">
        <p className="font-medium text-foreground">{lease.tenantName}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {lease.propertyName} / {lease.unitLabel}
        </p>
      </div>
      <LeaseBillingRuleFields
        companyOptions={billingFormConfig?.companyOptions}
        defaults={editableRule}
        fieldErrors={state.fieldErrors}
        operationalTimezone={
          billingFormConfig?.operationalTimezone ??
          editableRule?.rentCalculationTimezone ??
          "UTC"
        }
        organizationName={billingFormConfig?.organizationName ?? "our company"}
        rentSchedule={{
          currency: lease.formValues.monthlyRentCurrency,
          finalMonthRentAmount:
            finalMonthOpeningTerm?.rentAmount ??
            finalLeaseTerm?.rentAmount ??
            lease.formValues.monthlyRentAmount,
          firstMonthRentAmount:
            firstLeaseTerm?.rentAmount ?? lease.formValues.monthlyRentAmount,
          leaseEndDate: finalLeaseTerm?.endDate ?? lease.formValues.leaseEndDate,
          leaseStartDate:
            firstLeaseTerm?.startDate ?? lease.formValues.leaseStartDate,
          monthlyRentAmount: lease.formValues.monthlyRentAmount,
          rentDueDay: lease.formValues.rentDueDay,
        }}
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

function getOpeningTermForMonth(
  terms: LeaseTermContext[],
  billingPeriodEnd: string,
) {
  const billingPeriodStart = `${billingPeriodEnd.slice(0, 7)}-01`;

  return terms
    .filter(
      (term) =>
        term.startDate <= billingPeriodEnd &&
        term.endDate >= billingPeriodStart,
    )
    .reduce<LeaseTermContext | null>((opening, term) => {
      if (opening === null) return term;

      const openingStartsAfterMonth = opening.startDate > billingPeriodStart;
      const termStartsAfterMonth = term.startDate > billingPeriodStart;
      if (openingStartsAfterMonth !== termStartsAfterMonth) {
        return termStartsAfterMonth ? opening : term;
      }

      return term.startDate < opening.startDate ? term : opening;
    }, null);
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
  if (drawer.mode === "deposit") return "Manage security deposit";
  if (drawer.mode === "restore") return "Restore lease";
  return "Edit draft";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "archive")
    return "Archive this record without deleting its history.";
  if (drawer.mode === "billing") return undefined;
  if (drawer.mode === "deposit")
    return "Review the held balance and record deposit changes for this lease.";
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

function LeasePaymentReceiptAction({
  canRetry,
  result,
}: {
  canRetry: boolean;
  result: TenantPaymentReceiptResult;
}) {
  const [state, formAction] = useActionState(
    retryTenantReceiptPdfAction,
    initialFinanceActionState,
  );
  const href =
    state.status === "success" && state.artifactHref
      ? state.artifactHref
      : result.href;

  if (href) {
    return (
      <a
        className="font-medium text-primary underline-offset-2 hover:underline"
        href={href}
      >
        Download receipt
      </a>
    );
  }

  if (!result.unavailable) return null;
  if (!result.paymentId || !canRetry) {
    return <span className="text-muted-foreground">Receipt unavailable</span>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="paymentId" type="hidden" value={result.paymentId} />
      <LeaseReceiptRetrySubmit />
      {state.status === "error" && state.message ? (
        <span className="text-danger" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function LeaseReceiptRetrySubmit() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="outline">
      {pending ? "Retrying receipt..." : "Retry receipt"}
    </Button>
  );
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
