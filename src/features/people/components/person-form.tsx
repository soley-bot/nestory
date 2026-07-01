"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  createPersonAction,
  type PeopleActionState,
  updatePersonAction,
} from "@/features/people/actions";
import { formatRole } from "@/features/people/people.labels";
import type {
  PeopleSummary,
  PersonPartyType,
  PersonRoleValue,
} from "@/features/people/people.types";
import { cn } from "@/lib/utils";

const initialState: PeopleActionState = {};

const roleOptions: PersonRoleValue[] = ["tenant", "owner", "vendor", "staff"];

type PersonFormProps = {
  initialRoles?: PersonRoleValue[];
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (message: string) => void;
  person?: PeopleSummary | null;
  roleContext?: PersonRoleValue;
};

export function PersonForm({
  initialRoles,
  mode = "create",
  onClose,
  onSuccess,
  person,
  roleContext,
}: PersonFormProps) {
  const isEditMode = mode === "edit";
  const [state, action, pending] = useActionState(
    isEditMode ? updatePersonAction : createPersonAction,
    initialState,
  );
  const defaults = getPersonDefaults(person, initialRoles);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Person saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}

        {isEditMode && person ? (
          <input name="personId" type="hidden" value={person.id} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
          <Field label="Display name" error={state.fieldErrors?.displayName?.[0]}>
            <Input
              defaultValue={defaults.displayName}
              name="displayName"
              placeholder="Sokha Chan"
              required
              type="text"
            />
          </Field>

          <Field label="Party type" error={state.fieldErrors?.partyType?.[0]}>
            <SelectControl
              ariaLabel="Party type"
              defaultValue={defaults.partyType}
              name="partyType"
              options={[
                { label: "Individual", value: "individual" },
                { label: "Company", value: "company" },
              ]}
              required
            />
          </Field>
        </div>

        <Field label="Legal name" error={state.fieldErrors?.legalName?.[0]}>
          <Input
            defaultValue={defaults.legalName}
            name="legalName"
            placeholder="Optional registered name"
            type="text"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary email" error={state.fieldErrors?.primaryEmail?.[0]}>
            <Input
              defaultValue={defaults.primaryEmail}
              name="primaryEmail"
              placeholder="name@example.com"
              type="email"
            />
          </Field>

          <Field label="Primary phone" error={state.fieldErrors?.primaryPhone?.[0]}>
            <Input
              defaultValue={defaults.primaryPhone}
              name="primaryPhone"
              placeholder="+855 ..."
              type="tel"
            />
          </Field>
        </div>

        {roleContext ? (
          <LockedRoleField
            error={state.fieldErrors?.roles?.[0]}
            role={roleContext}
            roles={defaults.roles}
          />
        ) : (
          <Field label="Roles" error={state.fieldErrors?.roles?.[0]}>
            <div className="grid gap-2 sm:grid-cols-3">
              {roleOptions.map((role) => (
                <RoleCheckbox
                  defaultChecked={defaults.roles.includes(role)}
                  key={role}
                  role={role}
                />
              ))}
            </div>
          </Field>
        )}

        <Field label="Tax identifier" error={state.fieldErrors?.taxIdentifier?.[0]}>
          <Input
            defaultValue={defaults.taxIdentifier}
            name="taxIdentifier"
            placeholder="Optional"
            type="text"
          />
        </Field>

        <Field label="Notes" error={state.fieldErrors?.notes?.[0]}>
          <textarea
            className="min-h-28 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
            defaultValue={defaults.notes}
            name="notes"
            placeholder="Internal relationship, billing, or access notes"
          />
        </Field>
      </div>

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
            {isEditMode
              ? pending
                ? "Saving..."
                : "Save changes"
              : pending
                ? "Adding..."
                : `Add ${roleContext ? formatRole(roleContext).toLowerCase() : "person"}`}
          </Button>
        </div>
      </div>
    </form>
  );
}

function LockedRoleField({
  error,
  role,
  roles,
}: {
  error?: string;
  role: PersonRoleValue;
  roles: PersonRoleValue[];
}) {
  const submittedRoles = roles.length > 0 ? roles : [role];

  return (
    <Field label="Record type" error={error}>
      {submittedRoles.map((submittedRole) => (
        <input
          key={submittedRole}
          name="roles"
          type="hidden"
          value={submittedRole}
        />
      ))}
      <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-medium">
        {formatRole(role)}
      </div>
    </Field>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function RoleCheckbox({
  defaultChecked,
  role,
}: {
  defaultChecked: boolean;
  role: PersonRoleValue;
}) {
  return (
    <label
      className={cn(
        "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm transition-colors",
        "hover:bg-surface-muted",
      )}
    >
      <input
        className="h-4 w-4 rounded border-border accent-black"
        defaultChecked={defaultChecked}
        name="roles"
        type="checkbox"
        value={role}
      />
      <span>{formatRole(role)}</span>
    </label>
  );
}

function getPersonDefaults(
  person?: PeopleSummary | null,
  initialRoles: PersonRoleValue[] = [],
): {
  displayName: string;
  legalName: string;
  notes: string;
  partyType: PersonPartyType;
  primaryEmail: string;
  primaryPhone: string;
  roles: PersonRoleValue[];
  taxIdentifier: string;
} {
  const formValues = person?.formValues;

  return {
    displayName: formValues?.displayName ?? person?.displayName ?? "",
    legalName: formValues?.legalName ?? person?.legalName ?? "",
    notes: formValues?.notes ?? person?.notes ?? "",
    partyType: formValues?.partyType ?? person?.partyType ?? "individual",
    primaryEmail: formValues?.primaryEmail ?? person?.contact.email ?? "",
    primaryPhone: formValues?.primaryPhone ?? person?.contact.phone ?? "",
    roles: formValues?.roles ?? initialRoles,
    taxIdentifier: formValues?.taxIdentifier ?? "",
  };
}
