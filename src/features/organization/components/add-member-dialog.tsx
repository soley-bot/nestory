"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { PersonSelect } from "@/features/people/components/person-select";
import { createPersonAction, type PeopleActionState } from "@/features/people/actions";
import {
  buildAccessByPersonId,
  formatWorkspaceAccessRole,
  isOrganizationWideRole,
} from "@/features/organization/access-status";
import {
  inviteOrganizationUserAction,
  type OrganizationActionState,
} from "@/features/organization/actions";
import type {
  OrganizationBranch,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationStaffOption,
} from "@/features/organization/data";
import { WORKSPACE_ROLE_OPTIONS } from "@/features/organization/workspace-roles";
import { cn } from "@/lib/utils";

export type AddMemberDefaults = {
  email?: string;
  personId?: string;
  staffEmail?: string;
};

export type AddMemberDraftController = {
  discard: () => void;
  status: DraftStatus;
};

type DuplicateAccessTarget = { id: string; kind: "invitation" | "member" };
type WorkflowStep = "access" | "staff" | "review";
type StaffMode = "existing" | "new";
type AccessValues = {
  branchId: string;
  email: string;
  personId: string;
  role: OrganizationMembership["role"];
};
type StaffValues = {
  displayName: string;
  partyType: "company" | "individual";
  primaryEmail: string;
  primaryPhone: string;
};

export function AddMemberDialog({
  branches,
  defaults,
  invitations,
  members,
  onNavigateToInvitations,
  onDraftChange,
  onOpenChange,
  onReviewDuplicate,
  open,
  people,
  returnFocusRef,
}: {
  branches: OrganizationBranch[];
  defaults?: AddMemberDefaults;
  invitations: OrganizationInvitation[];
  members: OrganizationMembership[];
  onNavigateToInvitations: () => void;
  onDraftChange?: (controller: AddMemberDraftController | null) => void;
  onOpenChange: (open: boolean) => void;
  onReviewDuplicate: (target: DuplicateAccessTarget) => void;
  open: boolean;
  people: OrganizationStaffOption[];
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const initialAccess = useMemo<AccessValues>(
    () => ({
      branchId: branches.length === 1 ? branches[0]!.id : "",
      email: defaults?.email ?? "",
      personId: defaults?.personId ?? "",
      role: "operations_member",
    }),
    [branches, defaults],
  );
  const [step, setStep] = useState<WorkflowStep>("access");
  const [access, setAccess] = useState<AccessValues>(initialAccess);
  const [staffMode, setStaffMode] = useState<StaffMode>(
    defaults?.personId ? "existing" : "existing",
  );
  const [staff, setStaff] = useState<StaffValues>({
    displayName: "",
    partyType: "individual",
    primaryEmail: initialAccess.email,
    primaryPhone: "",
  });
  const [createdStaff, setCreatedStaff] = useState<{
    id: string;
    label: string;
    primaryEmail: string;
  }>();
  const [accessErrors, setAccessErrors] = useState<Partial<Record<keyof AccessValues, string>>>({});
  const [staffErrors, setStaffErrors] = useState<PeopleActionState["fieldErrors"]>();
  const [status, setStatus] = useState<"error" | "saving">();
  const [message, setMessage] = useState<string>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const submitting = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  const dirty =
    step !== "access" ||
    access.email !== initialAccess.email ||
    access.personId !== initialAccess.personId ||
    access.branchId !== initialAccess.branchId ||
    access.role !== initialAccess.role ||
    staffMode === "new" ||
    Boolean(staff.displayName || staff.primaryPhone || createdStaff);
  const organizationWide = isOrganizationWideRole(access.role);
  const selectedPerson = people.find((person) => person.id === access.personId);
  const selectedStaffEmail =
    selectedPerson?.primaryEmail ?? createdStaff?.primaryEmail ?? defaults?.staffEmail;
  const emailMismatch = Boolean(
    selectedStaffEmail &&
      access.email.trim() &&
      selectedStaffEmail.toLocaleLowerCase() !== access.email.trim().toLocaleLowerCase(),
  );
  const duplicateTarget = getDuplicateTarget(
    access.personId,
    branches,
    invitations,
    members,
  );
  const steps = organizationWide
    ? [
        { id: "access" as const, label: "Identity and access" },
        { id: "review" as const, label: "Review invitation" },
      ]
    : [
        { id: "access" as const, label: "Identity and access" },
        { id: "staff" as const, label: "Staff record" },
        { id: "review" as const, label: "Review invitation" },
      ];

  const reset = useCallback(() => {
    setStep("access");
    setAccess(initialAccess);
    setStaffMode("existing");
    setStaff({
      displayName: "",
      partyType: "individual",
      primaryEmail: initialAccess.email,
      primaryPhone: "",
    });
    setCreatedStaff(undefined);
    setAccessErrors({});
    setStaffErrors(undefined);
    setStatus(undefined);
    setMessage(undefined);
    submitting.current = false;
  }, [initialAccess]);

  const draftStatus: DraftStatus =
    status === "saving"
      ? "saving"
      : status === "error"
        ? "error"
        : dirty
          ? "dirty"
          : "clean";

  useEffect(() => {
    if (!onDraftChange) return;
    if (!open) {
      onDraftChange(null);
      return;
    }

    onDraftChange({ discard: reset, status: draftStatus });
    return () => onDraftChange(null);
  }, [draftStatus, onDraftChange, open, reset]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      reset();
      requestAnimationFrame(() => emailRef.current?.focus());
    }
    if (!open && wasOpen.current) {
      requestAnimationFrame(() => returnFocusRef?.current?.focus());
    }
    wasOpen.current = open;
  }, [open, reset, returnFocusRef]);

  function requestOpen(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  function setAccessField<K extends keyof AccessValues>(field: K, value: AccessValues[K]) {
    setAccess((current) => ({ ...current, [field]: value }));
    setAccessErrors((current) => ({ ...current, [field]: undefined }));
    setMessage(undefined);
    setStatus(undefined);
  }

  function continueFromAccess() {
    const errors: Partial<Record<keyof AccessValues, string>> = {};
    if (!/^\S+@\S+\.\S+$/.test(access.email.trim())) errors.email = "Enter a valid email.";
    if (!organizationWide && !access.branchId) errors.branchId = "Choose a branch.";
    setAccessErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (errors.email) emailRef.current?.focus();
      return;
    }
    if (organizationWide) {
      setAccess((current) => ({ ...current, branchId: "", personId: "" }));
      setStep("review");
    } else {
      setStaff((current) => ({
        ...current,
        primaryEmail: current.primaryEmail || access.email,
      }));
      setStep("staff");
    }
  }

  function continueFromStaff() {
    if (staffMode === "existing" && !access.personId) {
      setAccessErrors((current) => ({ ...current, personId: "Choose a Staff member." }));
      return;
    }
    if (staffMode === "new") {
      const errors: PeopleActionState["fieldErrors"] = {};
      if (!staff.displayName.trim()) errors.displayName = ["Enter a display name."];
      if (staff.primaryEmail && !/^\S+@\S+\.\S+$/.test(staff.primaryEmail.trim())) {
        errors.primaryEmail = ["Enter a valid email."];
      }
      setStaffErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }
    setStep("review");
  }

  async function sendInvitation() {
    if (submitting.current || duplicateTarget) return;
    submitting.current = true;
    setStatus("saving");
    setMessage("Sending invitation");
    let personId = organizationWide ? "" : access.personId;

    if (!organizationWide && staffMode === "new" && !createdStaff) {
      const staffResult = await createPersonAction({}, buildStaffFormData(staff));
      if (staffResult.status !== "success" || !staffResult.personId) {
        setStaffErrors(staffResult.fieldErrors);
        setMessage(staffResult.message ?? "Staff could not be saved.");
        setStatus("error");
        setStep("staff");
        submitting.current = false;
        return;
      }
      personId = staffResult.personId;
      setAccess((current) => ({ ...current, personId }));
      setCreatedStaff({
        id: personId,
        label: staff.displayName.trim(),
        primaryEmail: staff.primaryEmail.trim(),
      });
    } else if (createdStaff) {
      personId = createdStaff.id;
    }

    let result: OrganizationActionState;
    try {
      result = await inviteOrganizationUserAction(
        {},
        buildInvitationFormData({ ...access, personId }),
      );
    } catch {
      result = { message: "Invitation was not created.", status: "error" };
    }
    submitting.current = false;

    if (result.status === "success") {
      setStatus(undefined);
      setMessage(result.message);
      onOpenChange(false);
      return;
    }

    if (invitationWasPersisted(result)) {
      setMessage(
        result.message?.includes("delivery failed")
          ? "Invitation saved; delivery failed"
          : result.message,
      );
      setStatus("error");
      onNavigateToInvitations();
      onOpenChange(false);
      return;
    }

    setStatus("error");
    setMessage(
      createdStaff || (staffMode === "new" && personId)
        ? "Staff saved; invitation not created"
        : result.message ?? "Invitation was not created.",
    );
  }

  const primaryLabel =
    step === "review"
      ? createdStaff && status === "error"
        ? "Retry invitation"
        : "Send invitation"
      : "Continue";

  return (
    <>
      <Dialog onOpenChange={requestOpen} open={open}>
        <DialogContent
          className="max-h-[calc(100dvh-1rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
          onEscapeKeyDown={(event) => {
            if (dirty) {
              event.preventDefault();
              setConfirmDiscard(true);
            }
          }}
          showCloseButton={false}
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Add member</DialogTitle>
            <ol
              aria-label="Invitation progress"
              className={cn(
                "mt-2 grid gap-2 text-xs text-muted-foreground",
                steps.length === 2 ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              {steps.map((item, index) => (
                <li
                  aria-current={item.id === step ? "step" : undefined}
                  className={cn(
                    "border-t-2 pt-2",
                    item.id === step ? "border-primary font-medium text-foreground" : "border-border",
                  )}
                  key={item.id}
                >
                  <span className="sr-only">Step {index + 1}: </span>
                  {item.label}
                </li>
              ))}
            </ol>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-col"
            data-testid="add-member-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === "access") continueFromAccess();
              else if (step === "staff") continueFromStaff();
              else void sendInvitation();
            }}
          >
            <div className="min-h-0 overflow-y-auto px-5 py-4">
              {step === "access" ? (
                <AccessStep
                  access={access}
                  branches={branches}
                  errors={accessErrors}
                  organizationWide={organizationWide}
                  setAccessField={setAccessField}
                  emailRef={emailRef}
                />
              ) : null}
              {step === "staff" ? (
                <StaffStep
                  access={access}
                  errors={accessErrors}
                  people={people}
                  setAccessField={setAccessField}
                  setStaff={setStaff}
                  setStaffErrors={setStaffErrors}
                  setStaffMode={setStaffMode}
                  staff={staff}
                  staffErrors={staffErrors}
                  staffMode={staffMode}
                />
              ) : null}
              {step === "review" ? (
                <ReviewStep
                  access={access}
                  branches={branches}
                  duplicateTarget={duplicateTarget}
                  emailMismatch={emailMismatch}
                  message={message}
                  onReviewDuplicate={onReviewDuplicate}
                  selectedName={selectedPerson?.label ?? createdStaff?.label}
                  status={status}
                />
              ) : null}
            </div>
            <DialogFooter className="m-0 rounded-none px-5 py-3">
              {step !== "access" ? (
                <Button
                  disabled={status === "saving"}
                  onClick={() => {
                    setMessage(undefined);
                    setStatus(undefined);
                    setStep(step === "review" && organizationWide ? "access" : step === "review" ? "staff" : "access");
                  }}
                  type="button"
                  variant="outline"
                >
                  Back
                </Button>
              ) : null}
              <Button disabled={status === "saving" || Boolean(duplicateTarget)} type="submit">
                {status === "saving" ? "Working" : primaryLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        ariaLabel="Discard member invitation?"
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        description="Your member invitation changes will be lost."
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          reset();
          onOpenChange(false);
        }}
        open={confirmDiscard}
        title="Discard member invitation?"
      />
    </>
  );
}

function AccessStep({
  access,
  branches,
  emailRef,
  errors,
  organizationWide,
  setAccessField,
}: {
  access: AccessValues;
  branches: OrganizationBranch[];
  emailRef: RefObject<HTMLInputElement | null>;
  errors: Partial<Record<keyof AccessValues, string>>;
  organizationWide: boolean;
  setAccessField: <K extends keyof AccessValues>(field: K, value: AccessValues[K]) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Invitation email" error={errors.email} className="sm:col-span-2">
        <Input
          aria-invalid={Boolean(errors.email)}
          onChange={(event) => setAccessField("email", event.target.value)}
          ref={emailRef}
          type="email"
          value={access.email}
        />
      </Field>
      <Field label="Access level">
        <SelectControl
          ariaLabel="Access level"
          onValueChange={(value) => {
            const role = value as AccessValues["role"];
            setAccessField("role", role);
            if (isOrganizationWideRole(role)) {
              setAccessField("branchId", "");
              setAccessField("personId", "");
            } else if (!access.branchId && branches.length === 1) {
              setAccessField("branchId", branches[0]!.id);
            }
          }}
            options={WORKSPACE_ROLE_OPTIONS}
          value={access.role}
        />
      </Field>
      <Field label="Access scope" error={errors.branchId}>
        <SelectControl
          ariaLabel="Access scope"
          disabled={organizationWide}
          onValueChange={(value) => setAccessField("branchId", value)}
          options={
            organizationWide
              ? [{ label: "All branches", value: "" }]
              : [
                  { label: "Choose branch", value: "" },
                  ...branches.map((branch) => ({
                    label: branch.name,
                    value: branch.id,
                  })),
                ]
          }
          placeholder="Choose branch"
          value={access.branchId}
        />
      </Field>
    </div>
  );
}

function StaffStep({
  access,
  errors,
  people,
  setAccessField,
  setStaff,
  setStaffErrors,
  setStaffMode,
  staff,
  staffErrors,
  staffMode,
}: {
  access: AccessValues;
  errors: Partial<Record<keyof AccessValues, string>>;
  people: OrganizationStaffOption[];
  setAccessField: <K extends keyof AccessValues>(field: K, value: AccessValues[K]) => void;
  setStaff: React.Dispatch<React.SetStateAction<StaffValues>>;
  setStaffErrors: React.Dispatch<React.SetStateAction<PeopleActionState["fieldErrors"]>>;
  setStaffMode: (mode: StaffMode) => void;
  staff: StaffValues;
  staffErrors: PeopleActionState["fieldErrors"];
  staffMode: StaffMode;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Staff record choice">
        <Button onClick={() => setStaffMode("existing")} type="button" variant={staffMode === "existing" ? "default" : "outline"}>
          Existing Staff
        </Button>
        <Button onClick={() => setStaffMode("new")} type="button" variant={staffMode === "new" ? "default" : "outline"}>
          Create Staff
        </Button>
      </div>
      {staffMode === "existing" ? (
        <Field label="Staff member" error={errors.personId}>
          <PersonSelect
            aria-label="Staff member"
            name="personId"
            onValueChange={(value) => setAccessField("personId", value)}
            options={people}
            placeholder="Choose Staff"
            roles={["staff"]}
            value={access.personId}
          />
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="Staff name" error={staffErrors?.displayName?.[0]}>
            <Input value={staff.displayName} onChange={(event) => {
              setStaff((current) => ({ ...current, displayName: event.target.value }));
              setStaffErrors((current) => ({ ...current, displayName: undefined }));
            }} />
          </Field>
          <Field label="Party type">
            <SelectControl
              ariaLabel="Party type"
              onValueChange={(value) => setStaff((current) => ({ ...current, partyType: value as StaffValues["partyType"] }))}
              options={[{ label: "Individual", value: "individual" }, { label: "Company", value: "company" }]}
              value={staff.partyType}
            />
          </Field>
          <Field label="Primary email" error={staffErrors?.primaryEmail?.[0]}>
            <Input type="email" value={staff.primaryEmail} onChange={(event) => setStaff((current) => ({ ...current, primaryEmail: event.target.value }))} />
          </Field>
          <Field className="sm:col-span-2" label="Primary phone" error={staffErrors?.primaryPhone?.[0]}>
            <Input value={staff.primaryPhone} onChange={(event) => setStaff((current) => ({ ...current, primaryPhone: event.target.value }))} />
          </Field>
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  access,
  branches,
  duplicateTarget,
  emailMismatch,
  message,
  onReviewDuplicate,
  selectedName,
  status,
}: {
  access: AccessValues;
  branches: OrganizationBranch[];
  duplicateTarget?: DuplicateAccessTarget;
  emailMismatch: boolean;
  message?: string;
  onReviewDuplicate: (target: DuplicateAccessTarget) => void;
  selectedName?: string;
  status?: "error" | "saving";
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-heading text-base font-medium">Review invitation</h3>
      <dl className="divide-y rounded-lg border text-sm">
        <ReviewRow label="Invitation email" value={access.email} />
        <ReviewRow label="Access level" value={formatWorkspaceAccessRole(access.role)} />
        <ReviewRow
          label="Scope"
          value={
            isOrganizationWideRole(access.role)
              ? "All branches"
              : branches.find((branch) => branch.id === access.branchId)?.name ?? "Branch required"
          }
        />
        {!isOrganizationWideRole(access.role) ? (
          <ReviewRow label="Staff record" value={selectedName ?? "Staff required"} />
        ) : null}
      </dl>
      {emailMismatch ? (
        <p className="text-sm text-warning">Not {selectedName}&apos;s Staff email.</p>
      ) : null}
      {duplicateTarget ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm">
          <span>This Staff member already has workspace access.</span>
          <Button onClick={() => onReviewDuplicate(duplicateTarget)} size="sm" type="button" variant="outline">
            {duplicateTarget.kind === "invitation" ? "Review invitation" : "Review access"}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className={status === "error" ? "text-sm text-danger" : "text-sm text-muted-foreground"} role={status === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  children,
  className,
  error,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  label: string;
}) {
  const id = useId();
  return (
    <label className={cn("grid gap-1.5 text-sm font-medium", className)}>
      <span id={id}>{label}</span>
      {children}
      {error ? <span className="text-xs text-danger" role="alert">{error}</span> : null}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  );
}

function buildStaffFormData(staff: StaffValues) {
  const formData = new FormData();
  formData.set("displayName", staff.displayName.trim());
  formData.set("legalName", "");
  formData.set("notes", "");
  formData.set("partyType", staff.partyType);
  formData.set("primaryEmail", staff.primaryEmail.trim());
  formData.set("primaryPhone", staff.primaryPhone.trim());
  formData.set("roles", "staff");
  formData.set("taxIdentifier", "");
  return formData;
}

function buildInvitationFormData(access: AccessValues) {
  const formData = new FormData();
  formData.set("branchId", isOrganizationWideRole(access.role) ? "" : access.branchId);
  formData.set("email", access.email.trim());
  formData.set("personId", isOrganizationWideRole(access.role) ? "" : access.personId);
  formData.set("role", access.role);
  return formData;
}

function getDuplicateTarget(
  personId: string,
  branches: OrganizationBranch[],
  invitations: OrganizationInvitation[],
  members: OrganizationMembership[],
) {
  if (!personId) return undefined;
  const selectedAccess = buildAccessByPersonId(
    [personId],
    members,
    invitations,
    new Date(),
    branches,
  )[personId];
  if (selectedAccess?.state === "active_workspace_access") {
    return { id: selectedAccess.membershipId, kind: "member" as const };
  }
  if (selectedAccess && "invitationId" in selectedAccess) {
    return { id: selectedAccess.invitationId, kind: "invitation" as const };
  }
  return undefined;
}

function invitationWasPersisted(result: OrganizationActionState) {
  return Boolean(
    result.status === "error" &&
      (result.message?.includes("Invitation saved") ||
        result.message?.includes("delivery may have occurred") ||
        result.message?.includes("state could not be finalized")),
  );
}
