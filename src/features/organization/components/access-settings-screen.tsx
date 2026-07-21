"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { MailPlus, UserPlus, UsersRound } from "lucide-react";
import { SettingsNavigationGuardProvider, useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DraftActionBar, type DraftStatus } from "@/components/ui/draft-action-bar";
import { SelectControl } from "@/components/ui/select-control";
import { signOutAction } from "@/features/auth/actions";
import {
  inviteOrganizationUserAction,
  removeMemberAccessAction,
  resendOrganizationInvitationAction,
  revokeOrganizationInvitationAction,
  updateMemberAccessAction,
  type OrganizationActionState,
} from "@/features/organization/actions";
import type {
  OrganizationBranch,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationPersonOption,
} from "@/features/organization/data";

type AccessDraftController = {
  discard: () => void;
  status: DraftStatus;
};

const roleOptions = [
  { label: "Admin", value: "admin" },
  { label: "Manager", value: "manager" },
  { label: "Member", value: "member" },
];

export function AccessSettingsScreen({
  branches,
  currentUserId,
  inviteDefaults,
  invitations = [],
  members,
  people,
}: {
  branches: OrganizationBranch[];
  currentUserId?: string;
  inviteDefaults?: {
    email?: string;
    personId?: string;
  };
  invitations?: OrganizationInvitation[];
  members: OrganizationMembership[];
  people: OrganizationPersonOption[];
}) {
  return (
    <SettingsNavigationGuardProvider>
      <SettingsTabs activeHref="/users-roles" />
      <AccessWorkspace
        branches={branches}
        currentUserId={currentUserId}
        inviteDefaults={inviteDefaults}
        invitations={invitations}
        members={members}
        people={people}
      />
    </SettingsNavigationGuardProvider>
  );
}

function AccessWorkspace({
  branches,
  currentUserId,
  inviteDefaults,
  invitations = [],
  members,
  people,
}: Parameters<typeof AccessSettingsScreen>[0]) {
  const guard = useSettingsNavigationGuard();
  const controllers = useRef(new Map<string, AccessDraftController>());
  const [draftVersion, setDraftVersion] = useState(0);
  const adminCount = members.filter((member) => member.role === "admin").length;

  const registerDraft = useCallback(
    (id: string, controller: AccessDraftController | null) => {
      if (controller) {
        controllers.current.set(id, controller);
      } else {
        controllers.current.delete(id);
      }
      setDraftVersion((value) => value + 1);
    },
    [],
  );

  const discardAll = useCallback(() => {
    controllers.current.forEach((controller) => controller.discard());
  }, []);

  useEffect(() => {
    guard?.registerDraftController({ discard: discardAll });
    return () => guard?.registerDraftController(null);
  }, [discardAll, guard]);

  useEffect(() => {
    const statuses = Array.from(controllers.current.values(), (draft) => draft.status);
    const aggregate = statuses.includes("saving")
      ? "saving"
      : statuses.includes("error")
        ? "error"
        : statuses.includes("dirty")
          ? "dirty"
          : statuses.includes("saved")
            ? "saved"
            : "clean";
    guard?.setDraftStatus(aggregate);
  }, [draftVersion, guard]);

  return (
    <main className="grid gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.7fr)]">
      <section className="self-start rounded-md border border-border bg-surface-raised">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserPlus aria-hidden="true" size={15} />
              Invite user
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">Email, role, scope, and staff link</p>
          </div>
          <Link
            className="text-[13px] font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            href="/people?action=create"
          >
            Add person
          </Link>
        </div>
        <InviteUserForm
          branches={branches}
          defaults={inviteDefaults}
          onDraftChange={registerDraft}
          people={people}
        />
      </section>

      <div className="min-w-0 space-y-4">
        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MailPlus aria-hidden="true" size={15} />
              Pending invitations
            </h2>
            <Badge tone="neutral">{invitations.length}</Badge>
          </div>
          {invitations.length > 0 ? (
            <div className="divide-y divide-border">
              {invitations.map((invitation) => (
                <PendingInvitationRow
                  branches={branches}
                  invitation={invitation}
                  key={invitation.id}
                  people={people}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-foreground-muted">
              No pending invitations.
            </div>
          )}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound aria-hidden="true" size={15} />
              Active members
            </h2>
            <Badge tone="neutral">
              {members.length} active {members.length === 1 ? "member" : "members"}
            </Badge>
          </div>
          {members.length > 0 ? (
            <div className="divide-y divide-border">
              {members.map((member) => (
                <MemberAccessForm
                  adminCount={adminCount}
                  branches={branches}
                  current={member.userId === currentUserId}
                  key={member.id}
                  member={member}
                  onDraftChange={registerDraft}
                  people={people}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium">No active members</p>
              <p className="mt-1 text-sm text-foreground-muted">Accepted invitations appear here.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function InviteUserForm({
  branches,
  defaults,
  onDraftChange,
  people,
}: {
  branches: OrganizationBranch[];
  defaults?: { email?: string; personId?: string };
  onDraftChange: (id: string, controller: AccessDraftController | null) => void;
  people: OrganizationPersonOption[];
}) {
  const guard = useSettingsNavigationGuard();
  const emailId = useId();
  const initial = {
    branchId: "",
    email: defaults?.email ?? "",
    personId: defaults?.personId ?? "",
    role: "member",
  };
  const clean = {
    branchId: "",
    email: "",
    personId: "",
    role: "member",
  };
  const draft = useAccessDraft({
    action: inviteOrganizationUserAction,
    baselineValues: clean,
    initialStatus: initial.email || initial.personId ? "dirty" : "clean",
    initialValues: initial,
    validate: (values) =>
      /^\S+@\S+\.\S+$/.test(values.email.trim())
        ? undefined
        : { field: "email" as const, message: "Enter a valid email." },
  });
  const emailRef = useRef<HTMLInputElement>(null);

  useRegisterAccessDraft("add", draft.status, draft.discard, onDraftChange);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void draft.submit((field) => {
      if (field === "email") {
        emailRef.current?.focus();
      }
    });
  }

  return (
    <form data-testid="add-access-form" onSubmit={submit}>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <label className="grid gap-1.5 text-[13px] font-medium" htmlFor={emailId}>
          Email
          <input
            className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none shadow-sm transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
            id={emailId}
            disabled={draft.status === "saving"}
            onChange={(event) => draft.setField("email", event.target.value)}
            placeholder="user@example.com"
            ref={emailRef}
            type="email"
            value={draft.values.email}
          />
        </label>
        <AccessSelect
          disabled={draft.status === "saving"}
          label="Role"
          onValueChange={(value) => draft.setField("role", value)}
          options={roleOptions}
          value={draft.values.role}
        />
        <AccessSelect
          disabled={draft.status === "saving"}
          label="Scope"
          onValueChange={(value) => draft.setField("branchId", value)}
          options={branchOptions(branches)}
          value={draft.values.branchId}
        />
        <AccessSelect
          disabled={draft.status === "saving"}
          label="Staff link"
          onValueChange={(value) => draft.setField("personId", value)}
          options={personOptions(people)}
          value={draft.values.personId}
        />
      </div>
      <div className="flex flex-col">
        <div className="order-2 xl:order-1">
          <ConsequencePanel
            className="mx-4 mb-4"
            rows={accessRows(draft.values, branches, people)}
            title="Access effect"
          />
        </div>
        <div className="order-1 xl:order-2">
          <DraftActionBar
            focusOnError={
              draft.errorKind === "server" && !guard?.suppressErrorFocus
            }
            onDiscard={draft.discard}
            onSave={() => void draft.submit(() => emailRef.current?.focus())}
            saveLabel="Invite user"
            status={draft.status}
            statusMessage={draft.message}
          />
        </div>
      </div>
    </form>
  );
}

function PendingInvitationRow({
  branches,
  invitation,
  people,
}: {
  branches: OrganizationBranch[];
  invitation: OrganizationInvitation;
  people: OrganizationPersonOption[];
}) {
  const submitting = useRef(false);
  const [message, setMessage] = useState<string>();
  const [status, setStatus] = useState<"error" | "saving" | "success">();

  const runAction = async (
    action: (state: OrganizationActionState, formData: FormData) => Promise<OrganizationActionState>,
  ) => {
    if (submitting.current) {
      return;
    }
    submitting.current = true;
    setMessage("Updating invitation");
    setStatus("saving");
    const formData = new FormData();
    formData.set("invitationId", invitation.id);
    try {
      const result = await action({}, formData);
      setMessage(result.message);
      setStatus(result.status === "success" ? "success" : "error");
    } catch {
      setMessage("Invitation could not be updated.");
      setStatus("error");
    } finally {
      submitting.current = false;
    }
  };

  const statusLabel = invitation.status === "send_failed"
    ? "Delivery failed"
    : invitation.status === "expired"
      ? "Expired"
      : "Pending";
  const statusTone = invitation.status === "pending" ? "accent" : "warning";

  return (
    <article
      className="grid min-w-0 gap-4 px-4 py-4 xl:grid-cols-[minmax(180px,0.75fr)_minmax(0,1.5fr)_auto] xl:items-center"
      data-testid={`access-invitation-${invitation.id}`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{invitation.email}</p>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </div>
        <p className="mt-1 text-xs text-foreground-muted">
          {invitation.lastSentAt
            ? `Last sent ${formatAccessDate(invitation.lastSentAt)}`
            : "Not delivered yet"}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-foreground-muted">Role</dt>
          <dd className="mt-1 font-medium">{formatRole(invitation.role)}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Scope</dt>
          <dd className="mt-1 font-medium">{branchLabel(invitation.branchId ?? "", branches)}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Staff link</dt>
          <dd className="mt-1 font-medium">{personLabel(invitation.personId, people)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <button
          className="h-8 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={status === "saving"}
          onClick={() => void runAction(resendOrganizationInvitationAction)}
          type="button"
        >
          Resend
        </button>
        <button
          className="h-8 rounded-md border border-danger/30 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
          disabled={status === "saving"}
          onClick={() => void runAction(revokeOrganizationInvitationAction)}
          type="button"
        >
          Revoke
        </button>
        <p
          aria-live="polite"
          className={status === "error" ? "w-full text-xs text-danger" : "w-full text-xs text-foreground-muted"}
          role={status === "error" ? "alert" : undefined}
        >
          {message ?? `Expires ${formatAccessDate(invitation.expiresAt)}`}
        </p>
      </div>
    </article>
  );
}

function MemberAccessForm({
  adminCount,
  branches,
  current,
  member,
  onDraftChange,
  people,
}: {
  adminCount: number;
  branches: OrganizationBranch[];
  current: boolean;
  member: OrganizationMembership;
  onDraftChange: (id: string, controller: AccessDraftController | null) => void;
  people: OrganizationPersonOption[];
}) {
  const guard = useSettingsNavigationGuard();
  const removing = useRef(false);
  const [removeMessage, setRemoveMessage] = useState<string>();
  const [removeStatus, setRemoveStatus] = useState<"error" | "saving" | "success">();
  const draft = useAccessDraft({
    action: updateMemberAccessAction,
    initialValues: {
      branchId: member.branchId ?? "",
      memberId: member.id,
      personId: member.personId ?? "",
      role: member.role,
    },
  });
  const lastAdministrator = member.role === "admin" && adminCount === 1;
  const blocksLastAdminDemotion = lastAdministrator && draft.values.role !== "admin";
  const accountLabel = member.email ?? personLabel(member.personId, people);

  const removeAccess = async () => {
    if (lastAdministrator || removing.current) {
      return;
    }
    removing.current = true;
    setRemoveMessage("Removing access");
    setRemoveStatus("saving");
    const formData = new FormData();
    formData.set("memberId", member.id);
    try {
      const result = await removeMemberAccessAction({}, formData);
      if (result.status === "success" && current) {
        setRemoveMessage("Access removed. Signing out...");
        setRemoveStatus("success");
        await signOutAction();
        return;
      }
      setRemoveMessage(result.message);
      setRemoveStatus(result.status === "success" ? "success" : "error");
    } catch {
      setRemoveMessage("Access could not be removed.");
      setRemoveStatus("error");
    } finally {
      removing.current = false;
    }
  };

  useRegisterAccessDraft(member.id, draft.status, draft.discard, onDraftChange);

  return (
    <form
      className="grid min-w-0 gap-4 px-4 py-4 xl:grid-cols-[minmax(180px,0.65fr)_minmax(0,1.8fr)]"
      data-testid={`access-member-${member.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocksLastAdminDemotion) {
          void draft.submit();
        }
      }}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{accountLabel}</p>
          {current ? <Badge tone="accent">You</Badge> : null}
          <Badge tone="success">Active membership</Badge>
        </div>
        <p className="mt-1 truncate text-xs text-foreground-muted" title={member.email ?? undefined}>
          {member.email ?? "Email unavailable"}
        </p>
        {lastAdministrator ? (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm">
            <p className="font-medium text-warning">Last administrator</p>
            <p className="mt-1 text-foreground-muted">
              Another administrator is required before this role can be reduced.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <AccessSelect
          disabled={draft.status === "saving"}
          label="Role"
          onValueChange={(value) => draft.setField("role", value)}
          options={roleOptions}
          value={draft.values.role}
        />
        <AccessSelect
          disabled={draft.status === "saving"}
          label="Scope"
          onValueChange={(value) => draft.setField("branchId", value)}
          options={branchOptions(branches)}
          value={draft.values.branchId}
        />
        <AccessSelect
          disabled={draft.status === "saving"}
          label="Staff link"
          onValueChange={(value) => draft.setField("personId", value)}
          options={personOptions(people)}
          value={draft.values.personId}
        />
      </div>

      <ConsequencePanel
        className="xl:col-start-2"
        rows={accessRows(draft.values, branches, people)}
        title="Access effect"
      />

      <div className="xl:col-start-2">
        <DraftActionBar
          disabledReason={
            blocksLastAdminDemotion
              ? "Add another administrator before changing this role."
              : undefined
          }
          focusOnError={
            draft.errorKind === "server" && !guard?.suppressErrorFocus
          }
          onDiscard={draft.discard}
          onSave={() => void draft.submit()}
          saveLabel="Save access"
          status={draft.status}
          statusMessage={draft.message}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p
            aria-live="polite"
            className={removeStatus === "error" ? "text-sm text-danger" : "text-sm text-foreground-muted"}
            role={removeStatus === "error" ? "alert" : undefined}
          >
            {removeMessage ?? "Removing access immediately signs this account out of the workspace."}
          </p>
          <button
            className="h-8 rounded-md border border-danger/30 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
            disabled={lastAdministrator || removeStatus === "saving"}
            onClick={() => void removeAccess()}
            type="button"
          >
            Remove access
          </button>
        </div>
      </div>
    </form>
  );
}

function AccessSelect({
  disabled = false,
  label,
  onValueChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-[13px] font-medium">
      <span>{label}</span>
      <SelectControl
        ariaLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        options={options}
        value={value}
      />
    </label>
  );
}

function useRegisterAccessDraft(
  id: string,
  status: DraftStatus,
  discard: () => void,
  onDraftChange: (id: string, controller: AccessDraftController | null) => void,
) {
  useEffect(() => {
    onDraftChange(id, { discard, status });
    return () => onDraftChange(id, null);
  }, [discard, id, onDraftChange, status]);
}

function useAccessDraft<TValues extends Record<string, string>>({
  action,
  baselineValues,
  initialStatus = "clean",
  initialValues,
  validate,
}: {
  action: (state: OrganizationActionState, formData: FormData) => Promise<OrganizationActionState>;
  baselineValues?: TValues;
  initialStatus?: DraftStatus;
  initialValues: TValues;
  validate?: (values: TValues) => { field: keyof TValues; message: string } | undefined;
}) {
  const baseline = useRef({ ...(baselineValues ?? initialValues) });
  const alive = useRef(true);
  const submitting = useRef(false);
  const submission = useRef(0);
  const [message, setMessage] = useState<string>();
  const [errorKind, setErrorKind] = useState<"server" | "validation">();
  const [status, setStatus] = useState<DraftStatus>(initialStatus);
  const [values, setValues] = useState<TValues>({ ...initialValues });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      submission.current += 1;
      submitting.current = false;
    };
  }, []);

  const discard = useCallback(() => {
    submission.current += 1;
    submitting.current = false;
    setMessage(undefined);
    setErrorKind(undefined);
    setStatus("clean");
    setValues({ ...baseline.current });
  }, []);

  const setField = useCallback(<TKey extends keyof TValues>(key: TKey, value: string) => {
    if (submitting.current) {
      return;
    }
    setMessage(undefined);
    setErrorKind(undefined);
    setValues((current) => {
      const next = { ...current, [key]: value };
      const clean = Object.keys(baseline.current).every(
        (field) => next[field] === baseline.current[field],
      );
      setStatus(clean ? "clean" : "dirty");
      return next;
    });
  }, []);

  const submit = useCallback(async (onInvalid?: (field: keyof TValues) => void) => {
    if (submitting.current) {
      return;
    }
    const validation = validate?.(values);
    if (validation) {
      setMessage(validation.message);
      setErrorKind("validation");
      setStatus("error");
      requestAnimationFrame(() => onInvalid?.(validation.field));
      return;
    }

    submitting.current = true;
    const currentSubmission = submission.current + 1;
    submission.current = currentSubmission;
    setMessage("Saving access");
    setErrorKind(undefined);
    setStatus("saving");
    const formData = new FormData();
    const submittedValues = { ...values };
    Object.entries(submittedValues).forEach(([key, value]) => formData.set(key, value));

    try {
      const result = await action({}, formData);
      if (!alive.current || submission.current !== currentSubmission) {
        return;
      }
      setMessage(result.message);
      if (result.status === "success") {
        baseline.current = submittedValues;
        setStatus("saved");
      } else {
        setErrorKind("server");
        setStatus("error");
      }
    } catch {
      if (!alive.current || submission.current !== currentSubmission) {
        return;
      }
      setMessage("Access could not be saved.");
      setErrorKind("server");
      setStatus("error");
    } finally {
      if (submission.current === currentSubmission) {
        submitting.current = false;
      }
    }
  }, [action, validate, values]);

  return { discard, errorKind, message, setField, status, submit, values };
}

function accessRows(
  values: { branchId: string; personId: string; role: string },
  branches: OrganizationBranch[],
  people: OrganizationPersonOption[],
) {
  return [
    { label: "Role", value: formatRole(values.role) },
    {
      label: "Scope",
      value: values.role === "admin" ? "Organization-wide" : branchLabel(values.branchId, branches),
    },
    { label: "Staff link", value: personLabel(values.personId, people) },
    { label: "Effect", value: roleEffect(values.role, values.branchId, branches) },
  ];
}

function branchOptions(branches: OrganizationBranch[]) {
  return [
    { label: "All branches", value: "" },
    ...branches.map((branch) => ({ label: `${branch.code} - ${branch.name}`, value: branch.id })),
  ];
}

function personOptions(people: OrganizationPersonOption[]) {
  return [
    { label: "No staff link", value: "" },
    ...people.map((person) => ({ label: person.label, value: person.id })),
  ];
}

function branchLabel(branchId: string, branches: OrganizationBranch[]) {
  return branches.find((branch) => branch.id === branchId)?.name ?? "All branches";
}

function personLabel(personId: string | null, people: OrganizationPersonOption[]) {
  return people.find((person) => person.id === personId)?.label ?? "No staff link";
}

function formatRole(role: string) {
  return role === "admin" ? "Admin" : role === "manager" ? "Manager" : "Member";
}

function formatAccessDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleEffect(role: string, branchId: string, branches: OrganizationBranch[]) {
  if (role === "admin") {
    return "Full workspace access";
  }
  if (role === "manager") {
    return `Operational access · ${branchLabel(branchId, branches)}`;
  }
  return "Assigned work only";
}
