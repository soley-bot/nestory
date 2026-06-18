"use client";

import { useActionState, useEffect } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archivePersonAction,
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
};

export function ArchivePersonPanel({
  onClose,
  onSuccess,
  person,
}: PersonPanelProps) {
  const [state, action, pending] = useActionState(
    archivePersonAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Person archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="personId" type="hidden" value={person.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-danger">
          <Archive size={16} />
          <p className="text-sm font-semibold">Archive confirmation</p>
        </div>
        <PersonPanelSummary person={person} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          This removes the person from normal active views while keeping linked
          lease, ownership, vendor, document, and activity history available.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Archiving..." : "Archive person"}
        icon={<Archive size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

export function RestorePersonPanel({
  onClose,
  onSuccess,
  person,
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
    <form action={action} className="flex h-full flex-col">
      <input name="personId" type="hidden" value={person.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-accent">
          <RotateCcw size={16} />
          <p className="text-sm font-semibold">Restore confirmation</p>
        </div>
        <PersonPanelSummary person={person} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Restoring makes this person visible in normal operational views again.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Restoring..." : "Restore person"}
        icon={<RotateCcw size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

function PersonPanelSummary({ person }: { person: PeopleSummary }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
      <p className="text-sm font-medium">{person.displayName}</p>
      <p className="mt-1 text-sm text-muted">
        {person.partyTypeLabel} / {person.roleLabel}
      </p>
      <p className="mt-1 text-sm text-muted">{person.contact.label}</p>
    </div>
  );
}

function PanelMessage({ state }: { state: PeopleActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function PanelFooter({
  confirmLabel,
  icon,
  onClose,
  pending,
}: {
  confirmLabel: string;
  icon: React.ReactNode;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <div className="border-t border-border px-4 py-4 sm:px-5">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={pending}
          type="submit"
          variant="primary"
        >
          {icon}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
