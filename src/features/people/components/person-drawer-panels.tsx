"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveTenantAction,
  type PeopleActionState,
  restorePersonAction,
} from "@/features/people/actions";
import type { PeopleSummary } from "@/features/people/people.types";

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
  const hasBlockingLeases = blockingLeases.length > 0;
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
        {hasBlockingLeases ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {blockingLeases.length > 1
                ? "This tenant has open leases. End or cancel each lease from its lease record first, then return here to archive the tenant."
                : "This tenant has an open lease. End or cancel it from the lease record first, then return here to archive the tenant."} All linked history remains available.
            </p>
            <div className="flex flex-wrap gap-2">
              {blockingLeases.map((lease, index) => (
                <Button asChild key={lease.id} size="sm" variant="outline">
                  <Link href={lease.href}>
                    {blockingLeases.length > 1
                      ? `Review lease ${index + 1}`
                      : "Review lease"}
                  </Link>
                </Button>
              ))}
            </div>
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
            : isTenant
              ? "Archive tenant"
              : "Archive person"
        }
        icon={<Archive size={15} />}
        intent="danger"
        onClose={onClose}
        pending={pending}
        presentation={presentation}
        showConfirm={!hasBlockingLeases}
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
