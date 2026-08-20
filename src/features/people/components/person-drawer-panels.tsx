"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  archiveTenantAction,
  type PeopleActionState,
  restorePersonAction,
} from "@/features/people/actions";
import type { PeopleSummary } from "@/features/people/people.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";

const archiveInitialState: PeopleActionState = {};
const restoreInitialState: PeopleActionState = {};

type PersonPanelProps = {
  onClose: () => void;
  onSuccess: (message: string) => void;
  person: PeopleSummary;
  presentation?: "drawer" | "modal";
};

export function ArchivePersonPanel({
  onClose,
  onSuccess,
  person,
  presentation = "drawer",
}: PersonPanelProps) {
  const linkedLeases =
    person.linked.activeLeases.length > 0
      ? person.linked.activeLeases
      : person.linked.activeLease
        ? [person.linked.activeLease]
        : [];
  const blockingLeases = [
    ...new Map(linkedLeases.map((lease) => [lease.id, lease])).values(),
  ];
  const isTenant = person.roles.some(
    (role) => role.role === "tenant" && role.status === "active",
  );
  const draftOnly =
    blockingLeases.length > 0 &&
    blockingLeases.every((lease) => lease.status.toLowerCase() === "draft");
  const hasMultipleLeases = blockingLeases.length > 1;
  const today = getBusinessDateValue();
  const [state, action, pending] = useActionState(
    archiveTenantAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Person archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form
      action={action}
      className={
        presentation === "modal" ? "flex flex-col" : "flex h-full flex-col"
      }
    >
      <input name="personId" type="hidden" value={person.id} />
      {blockingLeases.map((lease) => (
        <input key={lease.id} name="leaseId" type="hidden" value={lease.id} />
      ))}
      {blockingLeases.length === 0 ? (
        <input name="effectiveDate" type="hidden" value={today} />
      ) : null}
      <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
        {presentation === "drawer" ? (
          <>
            <div className="flex items-center gap-2 text-danger">
              <Archive size={16} />
              <p className="text-sm font-semibold">Archive confirmation</p>
            </div>
            <PersonPanelSummary person={person} />
          </>
        ) : null}
        {hasMultipleLeases ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This tenant has multiple open leases. Review each lease first so
              no tenancy is ended by mistake. All linked history remains
              available.
            </p>
            <div className="flex flex-wrap gap-2">
              {blockingLeases.map((lease, index) => (
                <Button asChild key={lease.id} size="sm" variant="outline">
                  <Link href={lease.href}>Review lease {index + 1}</Link>
                </Button>
              ))}
            </div>
          </div>
        ) : blockingLeases.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {draftOnly
                ? "This tenant has a draft lease. If they are the primary tenant, the draft will be cancelled and they will be archived in one step."
                : "This tenant has an active lease. If they are the primary tenant, the tenancy will end and they will be archived in one step."} Co-tenants are never removed from a lease here. Rent, deposit, move, document, and audit history stays linked.
            </p>
            <div className="grid gap-1.5 text-sm font-medium">
              <span>{draftOnly ? "Cancellation date" : "End date"}</span>
              <DatePickerField
                aria-describedby={
                  state.fieldErrors?.effectiveDate?.length
                    ? "archive-effective-date-error"
                    : undefined
                }
                aria-invalid={Boolean(state.fieldErrors?.effectiveDate?.length)}
                ariaLabel={draftOnly ? "Cancellation date" : "End date"}
                defaultValue={today}
                name="effectiveDate"
                required
              />
              <FieldError
                errors={state.fieldErrors?.effectiveDate}
                id="archive-effective-date-error"
              />
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              Optional note
              <textarea
                aria-label="Optional note"
                className="min-h-20 resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                name="note"
              />
              <FieldError errors={state.fieldErrors?.note} />
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This person will leave active lists while linked history remains
            available. Permanent deletion is not available for operational
            person records.
          </p>
        )}
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={
          pending
            ? "Archiving..."
            : blockingLeases.length > 0
              ? "Archive tenant"
              : isTenant
                ? "Archive tenant"
                : "Archive person"
        }
        icon={<Archive size={15} />}
        intent="danger"
        onClose={onClose}
        pending={pending}
        presentation={presentation}
        showConfirm={!hasMultipleLeases}
      />
    </form>
  );
}

export function RestorePersonPanel({
  onClose,
  onSuccess,
  person,
  presentation = "drawer",
}: PersonPanelProps) {
  const [state, action, pending] = useActionState(
    restorePersonAction,
    restoreInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Person restored.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form
      action={action}
      className={
        presentation === "modal" ? "flex flex-col" : "flex h-full flex-col"
      }
    >
      <input name="personId" type="hidden" value={person.id} />
      <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
        {presentation === "drawer" ? (
          <>
            <div className="flex items-center gap-2 text-primary">
              <RotateCcw size={16} />
              <p className="text-sm font-semibold">Restore confirmation</p>
            </div>
            <PersonPanelSummary person={person} />
          </>
        ) : null}
        <p className="text-sm text-muted-foreground">
          This person will return to active directory views.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Restoring..." : "Restore person"}
        icon={<RotateCcw size={15} />}
        onClose={onClose}
        pending={pending}
        presentation={presentation}
      />
    </form>
  );
}

function PersonPanelSummary({ person }: { person: PeopleSummary }) {
  return (
    <div className="rounded-md border border-border bg-muted px-3 py-3">
      <p className="text-sm font-medium">{person.displayName}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {person.partyTypeLabel} / {person.roleLabel}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {person.contact.label}
      </p>
    </div>
  );
}

function PanelMessage({ state }: { state: PeopleActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function FieldError({ errors, id }: { errors?: string[]; id?: string }) {
  return errors?.length ? (
    <span
      className="text-xs font-normal text-danger"
      id={id}
      role="alert"
    >
      {errors[0]}
    </span>
  ) : null;
}

function PanelFooter({
  confirmLabel,
  icon,
  intent = "default",
  onClose,
  pending,
  presentation = "drawer",
  showConfirm = true,
}: {
  confirmLabel: string;
  icon: React.ReactNode;
  intent?: "danger" | "default";
  onClose: () => void;
  pending: boolean;
  presentation?: "drawer" | "modal";
  showConfirm?: boolean;
}) {
  return (
    <div
      className={
        presentation === "modal"
          ? "border-t border-border px-4 py-3 sm:px-5"
          : "border-t border-border px-4 py-4 sm:px-5"
      }
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          className="w-full sm:w-auto"
          onClick={onClose}
          type="button"
          variant={presentation === "modal" ? "outline" : "default"}
        >
          Cancel
        </Button>
        {showConfirm ? (
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant={
              presentation === "modal" && intent === "danger"
                ? "destructive"
                : "default"
            }
          >
            {icon}
            {confirmLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
