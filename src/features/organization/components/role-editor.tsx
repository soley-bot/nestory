"use client";

import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
import { Input } from "@/components/ui/input";
import { SideDrawer, useDrawerDraftGuard } from "@/components/ui/side-drawer";
import {
  normalizePermissionSelection,
  PERMISSION_GROUPS,
  type PermissionKey,
} from "@/lib/auth/permission-catalog";

export type EditableRole = {
  assignedUserCount: number;
  id: string;
  name: string;
  pendingInvitationCount: number;
  permissions: readonly PermissionKey[];
  status: "active" | "archived";
  version: number;
};

export type RoleEditorSubmission = {
  confirmRemovals: boolean;
  expectedVersion: number | null;
  id: string | null;
  name: string;
  permissions: PermissionKey[];
};

export type RoleEditorSaveResult =
  | {
      affectedUserCount: number;
      kind: "confirmation_required";
      submission: RoleEditorSubmission;
    }
  | { kind: "stale" }
  | { kind: "error"; message: string }
  | null;

export type RoleArchiveRequest = {
  expectedVersion: number;
  id: string;
};

export function getRoleEditorSubmissionFingerprint(
  submission: RoleEditorSubmission,
) {
  return JSON.stringify([
    submission.confirmRemovals,
    submission.id,
    submission.expectedVersion,
    submission.name,
    submission.permissions,
  ]);
}

type RoleEditorProps = {
  onArchive: (request: RoleArchiveRequest) => void;
  onClose: () => void;
  onDuplicate: (roleId: string) => void;
  onReload: (roleId: string) => void;
  onSave: (submission: RoleEditorSubmission) => void;
  open: boolean;
  role: EditableRole | null;
  saveResult: RoleEditorSaveResult;
  submitting?: boolean;
};

export function RoleEditor({ open, role, ...callbacks }: RoleEditorProps) {
  const draftKey = role
    ? [role.id, role.version, role.name, role.status, ...role.permissions].join(
        "|",
      )
    : "new";

  return (
    <RoleEditorDraft
      key={`${open ? "open" : "closed"}:${draftKey}`}
      open={open}
      role={role}
      {...callbacks}
    />
  );
}

function RoleEditorDraft({
  onArchive,
  onClose,
  onDuplicate,
  onReload,
  onSave,
  open,
  role,
  saveResult,
  submitting = false,
}: RoleEditorProps) {
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<PermissionKey[]>(
    role ? normalizePermissionSelection(role.permissions) : [],
  );

  const resetDraft = useCallback(() => {
    setName(role?.name ?? "");
    setPermissions(role ? normalizePermissionSelection(role.permissions) : []);
  }, [role]);
  const baselinePermissions = useMemo(
    () => (role ? normalizePermissionSelection(role.permissions) : []),
    [role],
  );
  const trimmedName = name.trim();
  const dirty =
    trimmedName !== (role?.name.trim() ?? "") ||
    permissions.join("|") !== baselinePermissions.join("|");
  const valid = trimmedName.length >= 2 && trimmedName.length <= 80;
  const archived = role?.status === "archived";
  const status: DraftStatus = submitting ? "saving" : dirty ? "dirty" : "clean";
  const assignedUserCount = role?.assignedUserCount ?? 0;
  const pendingInvitationCount = role?.pendingInvitationCount ?? 0;
  const assignmentConsequence = getAssignmentConsequence(role, permissions);
  const archiveConsequence = getArchiveConsequence(
    role,
    assignedUserCount,
    pendingInvitationCount,
  );
  const currentSubmission: RoleEditorSubmission = {
    confirmRemovals: false,
    expectedVersion: role?.version ?? null,
    id: role?.id ?? null,
    name: trimmedName,
    permissions,
  };
  const confirmationRequired =
    saveResult?.kind === "confirmation_required" &&
    getRoleEditorSubmissionFingerprint(saveResult.submission) ===
      getRoleEditorSubmissionFingerprint(currentSubmission);
  const saveConsequence =
    confirmationRequired && saveResult?.kind === "confirmation_required"
      ? saveResult.affectedUserCount === 0
        ? "Removing these permissions will not affect any assigned users."
        : `Removing these permissions will affect ${
            saveResult.affectedUserCount
          } assigned ${saveResult.affectedUserCount === 1 ? "user" : "users"}.`
      : saveResult?.kind === "stale"
        ? "This role changed elsewhere. Reload before saving."
        : saveResult?.kind === "error"
          ? saveResult.message
        : null;

  const discardAndClose = useCallback(() => {
    resetDraft();
    onClose();
  }, [onClose, resetDraft]);
  const guard = useMemo(
    () => ({ onDiscard: discardAndClose, status }),
    [discardAndClose, status],
  );
  const submitDraft = (confirmRemovals: boolean) => {
    onSave({
      ...currentSubmission,
      confirmRemovals,
    });
  };

  return (
    <SideDrawer
      footer={
        <>
          {role ? (
            <Button
              disabled={submitting || dirty}
              onClick={() => onDuplicate(role.id)}
              type="button"
              variant="ghost"
            >
              Duplicate
            </Button>
          ) : null}
          {role?.status === "active" ? (
            <Button
              disabled={
                assignedUserCount > 0 ||
                pendingInvitationCount > 0 ||
                submitting ||
                dirty
              }
              onClick={() =>
                onArchive({ expectedVersion: role.version, id: role.id })
              }
              type="button"
              variant="destructive"
            >
              Archive
            </Button>
          ) : null}
          {role && saveResult?.kind === "stale" ? (
            <Button
              disabled={submitting}
              onClick={() => onReload(role.id)}
              type="button"
              variant="outline"
            >
              Reload
            </Button>
          ) : null}
          <Button
            disabled={
              archived ||
              !dirty ||
              !valid ||
              submitting ||
              saveResult?.kind === "stale"
            }
            onClick={() => submitDraft(confirmationRequired)}
            type="button"
          >
            {confirmationRequired ? "Confirm changes" : "Save"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={role?.name ?? "New role"}
    >
      <RoleEditorDraftGuard guard={guard} />
      <div className="divide-y divide-border">
        <section className="grid gap-4 px-5 py-5" aria-label="Role details">
          <div className="grid gap-1 text-sm font-medium">
            <label htmlFor="role-name">Role name</label>
            <Input
              aria-describedby={
                name.length > 0 && !valid
                  ? "role-name-hint role-name-error"
                  : "role-name-hint"
              }
              aria-invalid={name.length > 0 && !valid ? "true" : undefined}
              autoComplete="off"
              disabled={submitting || archived}
              id="role-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <span
              className="text-xs font-normal text-muted-foreground"
              id="role-name-hint"
            >
              2–80 characters
            </span>
            {name.length > 0 && !valid ? (
              <span
                className="text-xs font-normal text-danger"
                id="role-name-error"
              >
                Role name must be between 2 and 80 characters.
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <Badge tone={archived ? "neutral" : "success"}>
                  {archived ? "Archived" : "Active"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Assignments</dt>
              <dd className="mt-1 font-medium">
                {role
                  ? formatAssignmentCount(
                      assignedUserCount,
                      pendingInvitationCount,
                    )
                  : "Available after saving"}
              </dd>
            </div>
          </dl>
          {assignmentConsequence ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="warning">Not assignable</Badge>
              <span className="text-muted-foreground">
                {assignmentConsequence}
              </span>
            </div>
          ) : null}
          {archiveConsequence ? (
            <p className="text-sm text-danger">{archiveConsequence}</p>
          ) : null}
          {saveConsequence ? (
            <p
              aria-live="polite"
              className={
                saveResult?.kind === "stale" || saveResult?.kind === "error"
                  ? "text-sm text-danger"
                  : "text-sm text-warning"
              }
            >
              {saveConsequence}
            </p>
          ) : null}
        </section>

        <section className="px-5 py-4" aria-labelledby="role-permissions-title">
          <h3 className="text-sm font-semibold" id="role-permissions-title">
            Permissions
          </h3>
          <div className="mt-3 divide-y divide-border">
            {PERMISSION_GROUPS.map((group) => (
              <fieldset
                aria-label={group.label}
                className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8rem_minmax(0,1fr)]"
                key={group.key}
              >
                <legend className="float-left w-full text-sm font-medium sm:w-32">
                  {group.label}
                </legend>
                <div className="grid min-w-0 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {group.permissions.map((permission) => (
                    <label
                      className="flex min-w-0 items-center gap-2 text-sm"
                      key={permission.key}
                    >
                      <Checkbox
                        checked={permissions.includes(permission.key)}
                        disabled={submitting || archived}
                        onCheckedChange={(checked) => {
                          setPermissions((current) =>
                            checked === true
                              ? normalizePermissionSelection([
                                  ...current,
                                  permission.key,
                                ])
                              : normalizePermissionSelection(current, [
                                  permission.key,
                                ]),
                          );
                        }}
                      />
                      <span>{permission.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      </div>
    </SideDrawer>
  );
}

function RoleEditorDraftGuard({
  guard,
}: {
  guard: Parameters<typeof useDrawerDraftGuard>[0];
}) {
  useDrawerDraftGuard(guard);
  return null;
}

function getAssignmentConsequence(
  role: EditableRole | null,
  permissions: readonly PermissionKey[],
) {
  if (role?.status === "archived") return "Archived roles cannot be assigned.";
  if (permissions.length === 0) {
    return "Add at least one permission before assigning this role.";
  }
  return null;
}

function getArchiveConsequence(
  role: EditableRole | null,
  assignedUserCount: number,
  pendingInvitationCount: number,
) {
  if (role?.status !== "active") return null;
  const assigned =
    assignedUserCount > 0
      ? `${assignedUserCount} assigned ${
          assignedUserCount === 1 ? "user" : "users"
        }`
      : null;
  const pending =
    pendingInvitationCount > 0
      ? `${pendingInvitationCount} pending ${
          pendingInvitationCount === 1 ? "invitation" : "invitations"
        }`
      : null;
  if (assigned && pending) {
    return `Reassign ${assigned} and revoke ${pending} before archiving.`;
  }
  if (assigned) return `Reassign ${assigned} before archiving.`;
  if (pending) return `Revoke ${pending} before archiving.`;
  return null;
}

function formatUserCount(count: number) {
  return `${count} ${count === 1 ? "user" : "users"}`;
}

function formatAssignmentCount(
  assignedUserCount: number,
  pendingInvitationCount: number,
) {
  const assigned = formatUserCount(assignedUserCount);
  if (pendingInvitationCount === 0) return assigned;
  return `${assigned}, ${pendingInvitationCount} pending ${
    pendingInvitationCount === 1 ? "invitation" : "invitations"
  }`;
}
