"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { WorkflowStageStrip } from "@/components/ui/workflow-stage-strip";
import { SideDrawer } from "@/components/ui/side-drawer";
import { DocumentForm } from "@/features/documents/components/document-screen";
import {
  ArchiveLeasePanel,
  RestoreLeasePanel,
} from "@/features/leases/components/lease-drawer-panels";
import { LeaseDetailView } from "@/features/leases/components/lease-detail-view";
import { LeaseForm } from "@/features/leases/components/lease-form";
import {
  cancelLeaseActivationAction,
  scheduleLeaseActivationAction,
  scheduleFutureRentTermAction,
  transitionLeaseLifecycleAction,
  type LeaseActionState,
} from "@/features/leases/actions";
import type { LeaseRecordSection } from "@/features/leases/lease-detail-route";
import type {
  LeasePropertyOption,
  LeaseSummary,
  LeaseTenantOption,
  LeaseTermContext,
  LeaseUnitOption,
} from "@/features/leases/lease.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";

type LeaseTransition = "activate" | "end" | "give_notice" | "terminate";
type LeaseTermChange = "renewal" | "rent_change";

type DrawerState = { mode: "archive" } | { mode: "edit" } | { mode: "restore" };

const initialActionState: LeaseActionState = {};

export function LeaseDetailScreen({
  activeSection,
  canConfigure,
  lease,
  propertyOptions,
  tenantOptions,
  unitOptions,
}: {
  activeSection: LeaseRecordSection;
  canConfigure: boolean;
  lease: LeaseSummary;
  propertyOptions: LeasePropertyOption[];
  tenantOptions: LeaseTenantOption[];
  unitOptions: LeaseUnitOption[];
}) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [transition, setTransition] = useState<LeaseTransition | null>(null);
  const [termChange, setTermChange] = useState<LeaseTermChange | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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

  return (
    <div className="lg:flex lg:flex-col">
      <PageHeader
        actions={
          canConfigure ? (
            lease.isArchived ? (
              <Button
                onClick={() => openDrawer({ mode: "restore" })}
                variant="default"
              >
                <RotateCcw aria-hidden size={15} /> Restore
              </Button>
            ) : lease.statusValue === "draft" ? (
              <>
                <Button
                  onClick={() => openDrawer({ mode: "edit" })}
                  variant="default"
                >
                  <Pencil aria-hidden size={15} /> Edit draft
                </Button>
                <Button
                  onClick={() => openDrawer({ mode: "archive" })}
                  variant="outline"
                >
                  <Archive aria-hidden size={15} /> Archive
                </Button>
              </>
            ) : (
              <Button
                onClick={() => openDrawer({ mode: "archive" })}
                variant="outline"
              >
                <Archive aria-hidden size={15} /> Archive
              </Button>
            )
          ) : null
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
        description={`${lease.propertyName} / ${lease.unitLabel}`}
        title={lease.tenantName}
      />

      {statusMessage ? (
        <div className="workspace-gutter-x pb-3">
          <p className="border-y border-border py-2 text-sm" role="status">
            {statusMessage}
          </p>
        </div>
      ) : null}

      {lease.activationSchedule ? (
        <ScheduledActivationNotice
          lease={lease}
          onSuccess={setStatusMessage}
        />
      ) : null}

      <LeaseDetailView
        activeSection={activeSection}
        canConfigure={canConfigure}
        lease={lease}
        onAttachFile={() => {
          setStatusMessage(null);
          setUploadOpen(true);
        }}
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
          ) : (
            <LeaseForm
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

        <WorkflowStageStrip current="lease" />

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
  if (drawer.mode === "restore") return "Restore lease";
  return "Edit draft";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "archive")
    return "Archive this record without deleting its history.";
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
  lease,
  onSuccess,
}: {
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
        {schedule.status === "pending" ? (
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

        <WorkflowStageStrip current="lease" />

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
