"use client";

import {
  useActionState,
  useEffect,
  useState,
  type ComponentProps,
} from "react";
import { Checkbox } from "@/components/ui/checkbox";
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
    displayName?: string,
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
  const submittedRoles =
    defaults.roles.length > 0
      ? defaults.roles
      : roleContext
        ? [roleContext]
        : [];

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(
        state.message ?? "Person saved.",
        state.personId,
        state.roles,
        state.displayName,
      );
      onClose();
    }
  }, [
    onClose,
    onSuccess,
    state.displayName,
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
              type="email"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.primaryPhone?.[0]}
            label="Primary phone"
            name="primaryPhone"
          >
            <PrimaryPhoneInput defaultValue={defaults.primaryPhone} />
          </RecordField>
        </div>
      </FormSection>

      {locksRole ? (
        submittedRoles.map((role) => (
          <input key={role} name="roles" type="hidden" value={role} />
        ))
      ) : (
        <FormSection title="Roles">
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

          <ConsequencePanel
            summary="Roles determine where this record appears in People. They do not grant workspace access."
            title="Role effect"
          />
        </FormSection>
      )}

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
        contactHeading: "Contact",
        displayNameLabel: "Owner name",
        identityHeading: "Owner identity",
        notesLabel: "Owner notes",
        showTaxIdentifier: true,
      };
    case "tenant":
      return {
        administrationHeading: "Tenancy details",
        contactHeading: "Contact",
        displayNameLabel: "Tenant name",
        identityHeading: "Tenant identity",
        notesLabel: "Tenancy notes",
        showTaxIdentifier: false,
      };
    case "staff":
      return {
        administrationHeading: "Staff context",
        contactHeading: "Contact",
        displayNameLabel: "Staff name",
        identityHeading: "Staff identity",
        notesLabel: "Staff notes",
        showTaxIdentifier: false,
      };
    case "vendor":
      return {
        administrationHeading: "Vendor details",
        contactHeading: "Contact",
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

function PrimaryPhoneInput({
  defaultValue,
  ...props
}: Omit<
  ComponentProps<typeof Input>,
  "defaultValue" | "name" | "onChange" | "type" | "value"
> & { defaultValue: string }) {
  const [value, setValue] = useState(() => formatPhoneInput(defaultValue));

  return (
    <Input
      {...props}
      autoComplete="tel"
      inputMode="tel"
      name="primaryPhone"
      onChange={(event) => setValue(formatPhoneInput(event.currentTarget.value))}
      type="tel"
      value={value}
    />
  );
}

function formatPhoneInput(value: string) {
  const trimmed = value.trimStart();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "").slice(0, 15);

  if (!digits) {
    return hasLeadingPlus ? "+" : "";
  }

  if (hasLeadingPlus && digits.startsWith("855")) {
    return joinPhoneGroups("+855", digits.slice(3), [2, 3, 3, 3]);
  }

  if (!hasLeadingPlus && digits.startsWith("0")) {
    return joinPhoneGroups("", digits, [3, 3, 3, 3]);
  }

  return hasLeadingPlus ? `+${digits}` : digits;
}

function joinPhoneGroups(prefix: string, digits: string, sizes: number[]) {
  const groups: string[] = [];
  let offset = 0;

  for (const size of sizes) {
    if (offset >= digits.length) break;
    groups.push(digits.slice(offset, offset + size));
    offset += size;
  }

  if (offset < digits.length) {
    groups.push(digits.slice(offset));
  }

  return [prefix, ...groups].filter(Boolean).join(" ");
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
        "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm transition-colors",
        "hover:bg-muted",
      )}
    >
      <Checkbox
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
