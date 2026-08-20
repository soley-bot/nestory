"use client";

import {
  useActionState,
  useEffect,
  useState,
  type ComponentProps,
} from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker-field";
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
  displayNameLabel: string;
  notesLabel: string;
  showTaxIdentifier: boolean;
  showTravelDocuments: boolean;
};

type PersonFormProps = {
  createSaveLabel?: string;
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
  createSaveLabel,
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
  const showsTravelDocuments =
    presentation.showTravelDocuments ||
    Boolean(
      isEditMode &&
        person?.roles.some(
          (role) =>
            role.status === "active" &&
            (role.role === "owner" || role.role === "tenant"),
        ),
    );
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
          : (createSaveLabel ??
            `Add ${roleContext ? formatRole(roleContext).toLowerCase() : "person"}`)
      }
      savingLabel={isEditMode ? "Saving person" : "Adding person"}
      state={state}
    >
      {isEditMode && person ? (
        <input name="personId" type="hidden" value={person.id} />
      ) : null}

      <div className="space-y-4">
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
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
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

        {showsTravelDocuments ? (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <RecordField
                error={state.fieldErrors?.passportNumber?.[0]}
                label="Passport number"
                name="passportNumber"
              >
                <Input
                  defaultValue={defaults.passportNumber}
                  name="passportNumber"
                  type="text"
                />
              </RecordField>

              <RecordField
                error={state.fieldErrors?.passportExpiryDate?.[0]}
                label="Passport expiry date"
                name="passportExpiryDate"
              >
                <DatePickerField
                  ariaLabel="Passport expiry date"
                  defaultValue={defaults.passportExpiryDate}
                  name="passportExpiryDate"
                />
              </RecordField>
            </div>

            <RecordField
              error={state.fieldErrors?.visaExpiryDate?.[0]}
              label="Visa expiry date"
              name="visaExpiryDate"
            >
              <DatePickerField
                ariaLabel="Visa expiry date"
                defaultValue={defaults.visaExpiryDate}
                name="visaExpiryDate"
              />
            </RecordField>
          </div>
        ) : (
          <>
            <input
              name="passportNumber"
              type="hidden"
              value={defaults.passportNumber}
            />
            <input
              name="passportExpiryDate"
              type="hidden"
              value={defaults.passportExpiryDate}
            />
            <input
              name="visaExpiryDate"
              type="hidden"
              value={defaults.visaExpiryDate}
            />
          </>
        )}

        {locksRole ? (
          submittedRoles.map((role) => (
            <input key={role} name="roles" type="hidden" value={role} />
          ))
        ) : (
          <div className="space-y-2 border-t border-border pt-4">
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
            <p className="text-xs text-muted-foreground">
              Roles control directory placement, not workspace access.
            </p>
          </div>
        )}

        <div className="space-y-4 border-t border-border pt-4">
          {presentation.showTaxIdentifier ? (
            <RecordField
              error={state.fieldErrors?.taxIdentifier?.[0]}
              label="Tax identifier"
              name="taxIdentifier"
            >
              <Input
                defaultValue={defaults.taxIdentifier}
                name="taxIdentifier"
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
              className="min-h-20 resize-y"
              defaultValue={defaults.notes}
              name="notes"
            />
          </RecordField>
        </div>
      </div>
    </RecordForm>
  );
}

function getPersonFormPresentation(
  role?: PersonRoleValue,
): PersonFormPresentation {
  switch (role) {
    case "owner":
      return {
        displayNameLabel: "Owner name",
        notesLabel: "Owner notes",
        showTaxIdentifier: true,
        showTravelDocuments: true,
      };
    case "tenant":
      return {
        displayNameLabel: "Tenant name",
        notesLabel: "Tenancy notes",
        showTaxIdentifier: false,
        showTravelDocuments: true,
      };
    case "staff":
      return {
        displayNameLabel: "Staff name",
        notesLabel: "Staff notes",
        showTaxIdentifier: false,
        showTravelDocuments: false,
      };
    case "vendor":
      return {
        displayNameLabel: "Vendor or business name",
        notesLabel: "Vendor notes",
        showTaxIdentifier: true,
        showTravelDocuments: false,
      };
    default:
      return {
        displayNameLabel: "Display name",
        notesLabel: "Internal notes",
        showTaxIdentifier: true,
        showTravelDocuments: false,
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
      onChange={(event) =>
        setValue(formatPhoneInput(event.currentTarget.value))
      }
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
      <Checkbox defaultChecked={defaultChecked} name="roles" value={role} />
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
  passportExpiryDate: string;
  passportNumber: string;
  primaryEmail: string;
  primaryPhone: string;
  roles: PersonRoleValue[];
  taxIdentifier: string;
  visaExpiryDate: string;
} {
  const formValues = person?.formValues;

  return {
    displayName: formValues?.displayName ?? person?.displayName ?? "",
    legalName: formValues?.legalName ?? person?.legalName ?? "",
    notes: formValues?.notes ?? person?.notes ?? "",
    partyType: formValues?.partyType ?? person?.partyType ?? "individual",
    passportExpiryDate:
      formValues?.passportExpiryDate ?? person?.passportExpiryDate ?? "",
    passportNumber: formValues?.passportNumber ?? person?.passportNumber ?? "",
    primaryEmail: formValues?.primaryEmail ?? person?.contact.email ?? "",
    primaryPhone: formValues?.primaryPhone ?? person?.contact.phone ?? "",
    roles: formValues?.roles ?? initialRoles,
    taxIdentifier: formValues?.taxIdentifier ?? "",
    visaExpiryDate: formValues?.visaExpiryDate ?? person?.visaExpiryDate ?? "",
  };
}
