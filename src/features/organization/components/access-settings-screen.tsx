"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
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
import { PersonSelect } from "@/features/people/components/person-select";
import {
  buildAccessByPersonId,
  formatWorkspaceAccessRole,
} from "@/features/organization/access-status";
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
  OrganizationStaffOption,
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
  focusedInvitationId,
  focusedMemberId,
  inviteDefaults,
  invitations = [],
  members,
  people,
  requestedStaffId,
}: {
  branches: OrganizationBranch[];
  currentUserId?: string;
  focusedInvitationId?: string;
  focusedMemberId?: string;
  inviteDefaults?: {
    email?: string;
    personId?: string;
    staffEmail?: string;
  };
  invitations?: OrganizationInvitation[];
  members: OrganizationMembership[];
  people: OrganizationStaffOption[];
  requestedStaffId?: string;
}) {
  return (
    <SettingsNavigationGuardProvider>
      <SettingsTabs activeHref="/users-roles" />
      <AccessWorkspace
        branches={branches}
        currentUserId={currentUserId}
        focusedInvitationId={focusedInvitationId}
        focusedMemberId={focusedMemberId}
        inviteDefaults={inviteDefaults}
        invitations={invitations}
        members={members}
        people={people}
        requestedStaffId={requestedStaffId}
      />
    </SettingsNavigationGuardProvider>
  );
}

function AccessWorkspace({
  branches,
  currentUserId,
  focusedInvitationId,
  focusedMemberId,
  inviteDefaults,
  invitations = [],
  members,
  people,
  requestedStaffId,
}: Parameters<typeof AccessSettingsScreen>[0]) {
  const guard = useSettingsNavigationGuard();
  const controllers = useRef(new Map<string, AccessDraftController>());
  const [draftVersion, setDraftVersion] = useState(0);
  const adminCount = members.filter((member) => member.role === "admin").length;
  const staffOptions = useMemo(() => activeStaffOptions(people), [people]);
  const accessByPersonId = useMemo(
    () =>
      buildAccessByPersonId(
        staffOptions.map((person) => person.id),
        members,
        invitations,
        new Date(),
        branches,
      ),
    [branches, invitations, members, staffOptions],
  );
  const staffWithoutAccess = useMemo(
    () =>
      staffOptions.filter(
        (person) => accessByPersonId[person.id]?.state === "no_access",
      ),
    [accessByPersonId, staffOptions],
  );

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
              Invite Staff
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">Connect one Staff record to one sign-in account.</p>
          </div>
          <Link
            className="text-[13px] font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            href="/staff?action=create"
          >
            Add Staff
          </Link>
        </div>
        <InviteUserForm
          branches={branches}
          defaults={inviteDefaults}
          invitations={invitations}
          key={requestedStaffId ?? inviteDefaults?.personId ?? "empty-invite"}
          members={members}
          onDraftChange={registerDraft}
          people={staffOptions}
        />
      </section>

      <div className="min-w-0 space-y-4">
        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound aria-hidden="true" size={15} />
              Staff without access
            </h2>
            <Badge tone="neutral">{staffWithoutAccess.length}</Badge>
          </div>
          {staffWithoutAccess.length > 0 ? (
            <div className="divide-y divide-border">
              {staffWithoutAccess.map((person) => (
                <div
                  className="flex min-w-0 items-center justify-between gap-4 px-4 py-3"
                  key={person.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{person.label}</p>
                    <p className="mt-1 truncate text-xs text-foreground-muted">
                      {person.primaryEmail ?? "No email recorded"}
                    </p>
                  </div>
                  <Link
                    aria-label={`Grant workspace access for ${person.label}`}
                    className="shrink-0 text-[13px] font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    href={`/users-roles?personId=${person.id}`}
                    prefetch={false}
                  >
                    Grant access
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-foreground-muted">
              Every active Staff record has an invitation or active access.
            </div>
          )}
        </section>

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
                  focused={invitation.id === focusedInvitationId}
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
              Active access
            </h2>
            <Badge tone="neutral">
              {members.length} active {members.length === 1 ? "account" : "accounts"}
            </Badge>
          </div>
          {members.length > 0 ? (
            <div className="divide-y divide-border">
              {members.map((member) => (
                <MemberAccessForm
                  adminCount={adminCount}
                  branches={branches}
                  current={member.userId === currentUserId}
                  focused={member.id === focusedMemberId}
                  key={member.id}
                  member={member}
                  onDraftChange={registerDraft}
                  people={people}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium">No active access</p>
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
  invitations,
  members,
  onDraftChange,
  people,
}: {
  branches: OrganizationBranch[];
  defaults?: { email?: string; personId?: string; staffEmail?: string };
  invitations: OrganizationInvitation[];
  members: OrganizationMembership[];
  onDraftChange: (id: string, controller: AccessDraftController | null) => void;
  people: OrganizationStaffOption[];
}) {
  const guard = useSettingsNavigationGuard();
  const emailId = useId();
  const emailHelpId = useId();
  const emailLabelId = useId();
  const staffHelpId = useId();
  const staffLabelId = useId();
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
    validate: (values) => {
      if (!values.personId) {
        return { field: "personId" as const, message: "Choose a Staff member." };
      }
      return /^\S+@\S+\.\S+$/.test(values.email.trim())
        ? undefined
        : { field: "email" as const, message: "Enter a valid email." };
    },
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const staffControlRef = useRef<HTMLDivElement>(null);
  const selectedPerson = people.find((person) => person.id === draft.values.personId);
  const selectedAccess = draft.values.personId
    ? buildAccessByPersonId(
        [draft.values.personId],
        members,
        invitations,
        new Date(),
        branches,
      )[draft.values.personId]
    : undefined;
  const duplicateTarget = selectedAccess?.state === "active_workspace_access"
    ? { id: selectedAccess.membershipId, kind: "member" as const }
    : selectedAccess && "invitationId" in selectedAccess
      ? { id: selectedAccess.invitationId, kind: "invitation" as const }
      : undefined;
  const duplicateMessage = selectedAccess?.state === "active_workspace_access"
    ? "This Staff member already has workspace access."
    : selectedAccess?.state === "delivery_failed"
      ? "This Staff member already has an invitation with failed delivery."
      : selectedAccess?.state === "expired"
        ? "This Staff member already has an expired invitation."
        : selectedAccess?.state === "invitation_pending"
          ? "This Staff member already has a pending invitation."
          : undefined;
  const selectedStaffEmail = selectedPerson?.primaryEmail ?? defaults?.staffEmail;
  const emailMismatch = selectedPerson && selectedStaffEmail && draft.values.email.trim()
    ? selectedStaffEmail.toLocaleLowerCase() !== draft.values.email.trim().toLocaleLowerCase()
    : false;

  useRegisterAccessDraft("add", draft.status, draft.discard, onDraftChange);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void draft.submit((field) => {
      if (field === "email") {
        emailRef.current?.focus();
      } else if (field === "personId") {
        staffControlRef.current?.querySelector<HTMLElement>("[role='combobox']")?.focus();
      }
    });
  }

  function focusDuplicate() {
    if (!duplicateTarget) return;
    document.getElementById(`access-${duplicateTarget.kind}-${duplicateTarget.id}`)?.focus();
  }

  return (
    <form data-testid="add-access-form" onSubmit={submit}>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="grid gap-1.5 text-[13px] font-medium" ref={staffControlRef}>
          <span id={staffLabelId}>Staff member</span>
          <PersonSelect
            aria-describedby={staffHelpId}
            aria-labelledby={staffLabelId}
            aria-required="true"
            disabled={draft.status === "saving"}
            name="personId"
            onValueChange={(value) => {
              draft.setField("personId", value);
              const primaryEmail = people.find((person) => person.id === value)?.primaryEmail;
              draft.setField("email", primaryEmail ?? "");
            }}
            options={people}
            placeholder="Choose Staff"
            roles={["staff"]}
            value={draft.values.personId}
          />
          <span className="text-xs font-normal text-foreground-muted" id={staffHelpId}>
            The employee or contractor this login belongs to.
          </span>
        </div>
        <div className="grid gap-1.5 text-[13px] font-medium">
          <span id={emailLabelId}>Invitation email</span>
          <input
            aria-describedby={emailHelpId}
            aria-labelledby={emailLabelId}
            className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none shadow-sm transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
            id={emailId}
            disabled={draft.status === "saving"}
            onChange={(event) => draft.setField("email", event.target.value)}
            placeholder="user@example.com"
            ref={emailRef}
            type="email"
            value={draft.values.email}
          />
          <span className="text-xs font-normal text-foreground-muted" id={emailHelpId}>
            The address used to sign in and receive the invitation.
          </span>
        </div>
        <AccessSelect
          disabled={draft.status === "saving"}
          description="What this person may administer in Nestory."
          label="Access level"
          onValueChange={(value) => {
            draft.setField("role", value);
            if (value === "admin") draft.setField("branchId", "");
          }}
          options={roleOptions}
          value={draft.values.role}
        />
        <AccessSelect
          disabled={draft.status === "saving" || draft.values.role === "admin"}
          description="Which branch or property context this person may access."
          label="Access scope"
          onValueChange={(value) => draft.setField("branchId", value)}
          options={branchOptions(branches)}
          value={draft.values.branchId}
        />
        <p className="text-xs leading-5 text-foreground-muted sm:col-span-2 xl:col-span-1 2xl:col-span-2">
          Workspace access controls sign-in permissions. It does not change the person&apos;s operational Staff role.
        </p>
        {emailMismatch ? (
          <p className="text-xs leading-5 text-warning sm:col-span-2 xl:col-span-1 2xl:col-span-2">
            This sign-in email differs from {selectedPerson?.label ?? "the selected Staff member"}&apos;s Staff email. The Staff record will not be changed.
          </p>
        ) : null}
        {duplicateMessage ? (
          <div className="flex justify-end rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm sm:col-span-2 xl:col-span-1 2xl:col-span-2">
            <button className="font-medium underline-offset-4 hover:underline" onClick={focusDuplicate} type="button">
              {duplicateTarget?.kind === "invitation" ? "Review invitation" : "Review access"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col">
        <div>
          <ConsequencePanel
            className="mx-4 mb-4"
            rows={accessRows(draft.values, branches, people)}
            title="Access effect"
          />
        </div>
        <div>
          <DraftActionBar
            disabledReason={duplicateMessage}
            focusOnError={
              draft.errorKind === "server" && !guard?.suppressErrorFocus
            }
            onDiscard={draft.discard}
            onSave={() => void draft.submit((field) => {
              if (field === "email") emailRef.current?.focus();
              if (field === "personId") {
                staffControlRef.current?.querySelector<HTMLElement>("[role='combobox']")?.focus();
              }
            })}
            saveLabel="Send invitation"
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
  focused,
  invitation,
  people,
}: {
  branches: OrganizationBranch[];
  focused: boolean;
  invitation: OrganizationInvitation;
  people: OrganizationStaffOption[];
}) {
  const rowRef = useRef<HTMLElement>(null);
  const revokeCancelRef = useRef<HTMLButtonElement>(null);
  const revokeTriggerRef = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const revokeTitleId = useId();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
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
    ? "Invitation failed"
    : invitation.status === "expired"
      ? "Invitation expired"
      : "Pending invitation";
  const statusTone = invitation.status === "pending" ? "accent" : "warning";
  const linkedPerson = people.find((person) => person.id === invitation.personId);

  useEffect(() => {
    if (focused) rowRef.current?.focus();
  }, [focused]);

  useEffect(() => {
    if (confirmingRevoke) revokeCancelRef.current?.focus();
  }, [confirmingRevoke]);

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(undefined);
      setStatus(undefined);
    }, 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  return (
    <article
      className="grid min-w-0 gap-4 px-4 py-4 xl:grid-cols-[minmax(180px,0.75fr)_minmax(0,1.5fr)_auto] xl:items-center"
      data-testid={`access-invitation-${invitation.id}`}
      id={`access-invitation-${invitation.id}`}
      ref={rowRef}
      tabIndex={-1}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{invitation.email}</p>
          <Badge tone={statusTone}>{statusLabel}</Badge>
          {linkedPerson?.archived ? <Badge tone="warning">Archived Staff</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-foreground-muted">
          {invitation.lastSentAt
            ? `Last sent ${formatAccessDate(invitation.lastSentAt)}`
            : "Not delivered yet"}
        </p>
        {invitation.status === "send_failed" ? (
          <p className="mt-1 text-xs text-warning">
            The invitation was created, but email delivery did not complete.
          </p>
        ) : null}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-foreground-muted">Access level</dt>
          <dd className="mt-1 font-medium">
            {formatWorkspaceAccessRole(invitation.role)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Access scope</dt>
          <dd className="mt-1 font-medium">{branchLabel(invitation.branchId ?? "", branches)}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Linked staff record</dt>
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
          onClick={() => setConfirmingRevoke(true)}
          ref={revokeTriggerRef}
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
        {confirmingRevoke ? (
          <div aria-labelledby={revokeTitleId} className="w-full rounded-md border border-danger/30 bg-danger-soft p-3 text-sm" role="alertdialog">
            <p className="font-medium" id={revokeTitleId}>Revoke this invitation?</p>
            <p className="mt-1 text-foreground-muted">The invitation link will stop working immediately.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="h-8 rounded-md px-3 font-medium"
                onClick={() => {
                  setConfirmingRevoke(false);
                  revokeTriggerRef.current?.focus();
                }}
                ref={revokeCancelRef}
                type="button"
              >
                Keep invitation
              </button>
              <button
                className="h-8 rounded-md border border-danger/30 px-3 font-medium text-danger"
                onClick={() => {
                  setConfirmingRevoke(false);
                  void runAction(revokeOrganizationInvitationAction);
                }}
                type="button"
              >
                Revoke invitation
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MemberAccessForm({
  adminCount,
  branches,
  current,
  focused,
  member,
  onDraftChange,
  people,
}: {
  adminCount: number;
  branches: OrganizationBranch[];
  current: boolean;
  focused: boolean;
  member: OrganizationMembership;
  onDraftChange: (id: string, controller: AccessDraftController | null) => void;
  people: OrganizationStaffOption[];
}) {
  const guard = useSettingsNavigationGuard();
  const formRef = useRef<HTMLFormElement>(null);
  const removeCancelRef = useRef<HTMLButtonElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const staffChangeCancelRef = useRef<HTMLButtonElement>(null);
  const staffChangeTriggerRef = useRef<HTMLElement>(null);
  const removing = useRef(false);
  const removeTitleId = useId();
  const staffChangeTitleId = useId();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingStaffChange, setConfirmingStaffChange] = useState<"replace" | "unlink">();
  const [removeMessage, setRemoveMessage] = useState<string>();
  const [removeStatus, setRemoveStatus] = useState<"error" | "saving" | "success">();
  const draft = useAccessDraft({
    action: updateMemberAccessAction,
    initialValues: {
      branchId: member.role === "admin" ? "" : member.branchId ?? "",
      memberId: member.id,
      personId: member.personId ?? "",
      role: member.role,
    },
  });
  const lastAdministrator = member.role === "admin" && adminCount === 1;
  const blocksLastAdminDemotion = lastAdministrator && draft.values.role !== "admin";
  const accountLabel = member.email ?? personLabel(member.personId, people);
  const linkedPerson = people.find((person) => person.id === member.personId);
  const selectablePeople = activeStaffOptions(people);
  const linkingLegacyMember = !member.personId && Boolean(draft.values.personId);

  const saveAccess = () => {
    if (member.personId && draft.values.personId !== member.personId) {
      staffChangeTriggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setConfirmingStaffChange(draft.values.personId ? "replace" : "unlink");
      return;
    }
    void draft.submit();
  };

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

  useEffect(() => {
    if (focused) formRef.current?.focus();
  }, [focused]);

  useEffect(() => {
    if (confirmingStaffChange) staffChangeCancelRef.current?.focus();
  }, [confirmingStaffChange]);

  useEffect(() => {
    if (confirmingRemove) removeCancelRef.current?.focus();
  }, [confirmingRemove]);

  useEffect(() => {
    if (removeStatus !== "success" || current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRemoveMessage(undefined);
      setRemoveStatus(undefined);
    }, 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [current, removeStatus]);

  return (
    <form
      className="grid min-w-0 gap-4 px-4 py-4 xl:grid-cols-[minmax(180px,0.65fr)_minmax(0,1.8fr)]"
      data-testid={`access-member-${member.id}`}
      id={`access-member-${member.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocksLastAdminDemotion) {
          saveAccess();
        }
      }}
      ref={formRef}
      tabIndex={-1}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{accountLabel}</p>
          {current ? <Badge tone="accent">You</Badge> : null}
          <Badge tone="success">Active access</Badge>
          {!member.personId ? (
            <Badge tone="warning">Legacy unlinked access</Badge>
          ) : null}
          {linkedPerson?.archived ? <Badge tone="warning">Archived Staff</Badge> : null}
        </div>
        <p className="mt-1 truncate text-xs text-foreground-muted" title={member.email ?? undefined}>
          {member.email ?? "Email unavailable"}
        </p>
        {!member.personId ? (
          <p className="mt-2 text-sm font-medium text-warning">Not linked to a Staff record</p>
        ) : null}
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
          label="Access level"
          onValueChange={(value) => {
            draft.setField("role", value);
            if (value === "admin") draft.setField("branchId", "");
          }}
          options={roleOptions}
          value={draft.values.role}
        />
        <AccessSelect
          disabled={draft.status === "saving" || draft.values.role === "admin"}
          label="Access scope"
          onValueChange={(value) => draft.setField("branchId", value)}
          options={branchOptions(branches)}
          value={draft.values.branchId}
        />
        <label className="grid min-w-0 gap-1.5 text-[13px] font-medium">
          <span>Linked staff record</span>
          <PersonSelect
            aria-label="Linked staff record"
            allowClear
            context="linked Staff record"
            disabled={draft.status === "saving"}
            name="personId"
            onValueChange={(value) => draft.setField("personId", value)}
            options={selectablePeople}
            placeholder="Choose Staff"
            preservedOption={linkedPerson}
            roles={["staff"]}
            value={draft.values.personId}
          />
        </label>
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
          onSave={saveAccess}
          saveLabel={linkingLegacyMember ? "Link staff record" : "Save access"}
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
            onClick={() => setConfirmingRemove(true)}
            ref={removeTriggerRef}
            type="button"
          >
            Remove access
          </button>
        </div>
        {confirmingStaffChange ? (
          <div aria-labelledby={staffChangeTitleId} className="mt-3 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm" role="alertdialog">
            <p className="font-medium" id={staffChangeTitleId}>
              {confirmingStaffChange === "unlink" ? "Unlink this Staff record?" : "Replace the linked Staff record?"}
            </p>
            <p className="mt-1 text-foreground-muted">
              {confirmingStaffChange === "unlink"
                ? `Workspace access will remain, but it will no longer be tied to ${linkedPerson?.label ?? "this account"}'s Staff record.`
                : "Workspace access will move to the newly selected Staff record without changing either Staff record."}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="h-8 rounded-md px-3 font-medium"
                onClick={() => {
                  setConfirmingStaffChange(undefined);
                  staffChangeTriggerRef.current?.focus();
                }}
                ref={staffChangeCancelRef}
                type="button"
              >
                Keep current link
              </button>
              <button
                className="h-8 rounded-md border border-warning/30 px-3 font-medium"
                onClick={() => {
                  setConfirmingStaffChange(undefined);
                  void draft.submit();
                }}
                type="button"
              >
                {confirmingStaffChange === "unlink" ? "Confirm unlink" : "Confirm replacement"}
              </button>
            </div>
          </div>
        ) : null}
        {confirmingRemove ? (
          <div aria-labelledby={removeTitleId} className="mt-3 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm" role="alertdialog">
            <p className="font-medium" id={removeTitleId}>Remove workspace access?</p>
            <p className="mt-1 text-foreground-muted">This account will lose workspace access immediately.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="h-8 rounded-md px-3 font-medium"
                onClick={() => {
                  setConfirmingRemove(false);
                  removeTriggerRef.current?.focus();
                }}
                ref={removeCancelRef}
                type="button"
              >
                Keep access
              </button>
              <button
                className="h-8 rounded-md border border-danger/30 px-3 font-medium text-danger"
                onClick={() => {
                  setConfirmingRemove(false);
                  void removeAccess();
                }}
                type="button"
              >
                Confirm remove access
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function AccessSelect({
  description,
  disabled = false,
  label,
  onValueChange,
  options,
  value,
}: {
  description?: string;
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
      {description ? <span className="text-xs font-normal text-foreground-muted">{description}</span> : null}
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

  useEffect(() => {
    if (status !== "saved") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!alive.current) {
        return;
      }
      setMessage(undefined);
      setStatus((current) => (current === "saved" ? "clean" : current));
    }, 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

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
  people: OrganizationStaffOption[],
) {
  return [
    { label: "Access level", value: formatWorkspaceAccessRole(values.role) },
    {
      label: "Access scope",
      value: values.role === "admin" ? "Organization-wide" : branchLabel(values.branchId, branches),
    },
    { label: "Linked staff record", value: personLabel(values.personId, people) },
    { label: "Effect", value: roleEffect(values.role, values.branchId, branches) },
  ];
}

function branchOptions(branches: OrganizationBranch[]) {
  return [
    { label: "All branches", value: "" },
    ...branches.map((branch) => ({ label: `${branch.code} - ${branch.name}`, value: branch.id })),
  ];
}

function branchLabel(branchId: string, branches: OrganizationBranch[]) {
  return branches.find((branch) => branch.id === branchId)?.name ?? "All branches";
}

function personLabel(personId: string | null, people: OrganizationStaffOption[]) {
  return people.find((person) => person.id === personId)?.label ?? "Not linked to a Staff record";
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

function activeStaffOptions(people: OrganizationStaffOption[]) {
  const byId = new Map<string, OrganizationStaffOption>();
  for (const person of people) {
    if (!person.activeStaff || person.archived || !person.roles.includes("staff") || byId.has(person.id)) continue;
    byId.set(person.id, person);
  }
  return [...byId.values()];
}
