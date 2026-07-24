"use client";

import { useActionState, useEffect } from "react";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { Textarea } from "@/components/ui/textarea";
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

type PersonFormPresentation = {
  administrationHeading: string;
  contactHeading: string;
  displayNameLabel: string;
  identityHeading: string;
  notesLabel: string;
  showTaxIdentifier: boolean;
};

type PersonFormProps = {
  initialRoles?: PersonRoleValue[];
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (
    message: string,
    personId?: string,
    roles?: PersonRoleValue[],
  ) => void;
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
  const presentation = getPersonFormPresentation(roleContext);
  const locksRole = !isEditMode && Boolean(roleContext);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Person saved.", state.personId, state.roles);
      onClose();
    }
  }, [
    onClose,
    onSuccess,
    state.message,
    state.personId,
    state.roles,
    state.status,
  ]);

  return (
    <RecordForm
      action={action}
      ariaLabel={isEditMode ? "Edit person form" : "Add person form"}
      onCancel={onClose}
      pending={pending}
      saveLabel={
        isEditMode
          ? "Save changes"
          : `Add ${roleContext ? formatRole(roleContext).toLowerCase() : "person"}`
      }
      savingLabel={isEditMode ? "Saving person" : "Adding person"}
      state={state}
    >
      {isEditMode && person ? (
        <input name="personId" type="hidden" value={person.id} />
      ) : null}

      <FormSection title={presentation.identityHeading}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
          <RecordField
            error={state.fieldErrors?.displayName?.[0]}
            label={presentation.displayNameLabel}
            name="displayName"
            required
          >
            <Input
              defaultValue={defaults.displayName}
              name="displayName"
              placeholder="Sokha Chan"
              required
              type="text"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.partyType?.[0]}
            label="Party type"
            name="partyType"
            required
          >
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
          </RecordField>
        </div>

        <RecordField
          error={state.fieldErrors?.legalName?.[0]}
          label="Legal name"
          name="legalName"
        >
          <Input
            defaultValue={defaults.legalName}
            name="legalName"
            placeholder="Optional registered name"
            type="text"
          />
        </RecordField>
      </FormSection>

      <FormSection title={presentation.contactHeading}>
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            error={state.fieldErrors?.primaryEmail?.[0]}
            label="Primary email"
            name="primaryEmail"
          >
            <Input
              defaultValue={defaults.primaryEmail}
              name="primaryEmail"
              placeholder="name@example.com"
              type="email"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.primaryPhone?.[0]}
            label="Primary phone"
            name="primaryPhone"
          >
            <Input
              defaultValue={defaults.primaryPhone}
              name="primaryPhone"
              placeholder="+855 ..."
              type="tel"
            />
          </RecordField>
        </div>
      </FormSection>

      <FormSection title={locksRole ? "Record type" : "Roles"}>
        {locksRole && roleContext ? (
          <LockedRoleField
            error={state.fieldErrors?.roles?.[0]}
            role={roleContext}
            roles={defaults.roles}
          />
        ) : (
          <RecordField
            error={state.fieldErrors?.roles?.[0]}
            label="Operational roles"
            name="roles"
            required
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {roleOptions.map((role) => (
                <RoleCheckbox
                  defaultChecked={defaults.roles.includes(role)}
                  key={role}
                  role={role}
                />
              ))}
            </div>
          </RecordField>
        )}

        <ConsequencePanel
          summary={
            roleContext === "staff"
              ? "Create the Staff record first, then grant Workspace Access with an Access Level and Scope."
              : "Roles determine where this record appears in People workflows. They do not grant workspace access."
          }
          title={roleContext === "staff" ? "Access boundary" : "Role effect"}
        />
      </FormSection>

      <FormSection title={presentation.administrationHeading}>
        {presentation.showTaxIdentifier ? (
          <RecordField
            error={state.fieldErrors?.taxIdentifier?.[0]}
            label="Tax identifier"
            name="taxIdentifier"
          >
            <Input
              defaultValue={defaults.taxIdentifier}
              name="taxIdentifier"
              placeholder="Optional"
              type="text"
            />
          </RecordField>
        ) : (
          <input
            name="taxIdentifier"
            type="hidden"
            value={defaults.taxIdentifier}
          />
        )}

        <RecordField
          error={state.fieldErrors?.notes?.[0]}
          label={presentation.notesLabel}
          name="notes"
        >
          <Textarea
            className="min-h-28 resize-y"
            defaultValue={defaults.notes}
            name="notes"
            placeholder="Internal relationship, billing, or access notes"
          />
        </RecordField>
      </FormSection>
    </RecordForm>
  );
}

function getPersonFormPresentation(
  role?: PersonRoleValue,
): PersonFormPresentation {
  switch (role) {
    case "owner":
      return {
        administrationHeading: "Owner details",
        contactHeading: "Statement contact",
        displayNameLabel: "Owner name",
        identityHeading: "Owner identity",
        notesLabel: "Owner notes",
        showTaxIdentifier: true,
      };
    case "tenant":
      return {
        administrationHeading: "Tenancy details",
        contactHeading: "Tenancy contact",
        displayNameLabel: "Tenant name",
        identityHeading: "Tenant identity",
        notesLabel: "Tenancy notes",
        showTaxIdentifier: false,
      };
    case "staff":
      return {
        administrationHeading: "Staff context",
        contactHeading: "Operational contact",
        displayNameLabel: "Staff name",
        identityHeading: "Staff identity",
        notesLabel: "Staff notes",
        showTaxIdentifier: false,
      };
    case "vendor":
      return {
        administrationHeading: "Vendor details",
        contactHeading: "Business contact",
        displayNameLabel: "Vendor or business name",
        identityHeading: "Vendor identity",
        notesLabel: "Vendor notes",
        showTaxIdentifier: true,
      };
    default:
      return {
        administrationHeading: "Administration",
        contactHeading: "Contact",
        displayNameLabel: "Display name",
        identityHeading: "Identity",
        notesLabel: "Internal notes",
        showTaxIdentifier: true,
      };
  }
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
    <RecordField
      error={error}
      label="Record type"
      name="roles"
      required
    >
      <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-medium">
        {formatRole(role)}
      </div>
      {submittedRoles.map((submittedRole) => (
        <input
          key={submittedRole}
          name="roles"
          type="hidden"
          value={submittedRole}
        />
      ))}
    </RecordField>
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
      <CheckboxControl
        defaultChecked={defaultChecked}
        name="roles"
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
