"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  archiveOrganizationRoleAction,
  duplicateOrganizationRoleAction,
  saveOrganizationRoleAction,
} from "@/features/organization/actions";
import type { OrganizationRole } from "@/features/organization/data";

import {
  RoleEditor,
  type EditableRole,
  type RoleArchiveRequest,
  type RoleEditorSaveResult,
  type RoleEditorSubmission,
} from "./role-editor";
import { RoleRegister, type RoleSummary } from "./role-register";

export function RoleSettingsScreen({
  roles,
  superAdminUserCount,
}: {
  roles: OrganizationRole[];
  superAdminUserCount: number;
}) {
  const rolesKey = roles
    .map((role) =>
      [
        role.id,
        role.version,
        role.name,
        role.status,
        role.assignedUserCount,
        role.pendingInvitationCount,
        ...role.permissions,
      ].join(":"),
    )
    .join("|");

  return (
    <RoleSettingsScreenState
      key={rolesKey}
      roles={roles}
      superAdminUserCount={superAdminUserCount}
    />
  );
}

function RoleSettingsScreenState({
  roles: initialRoles,
  superAdminUserCount,
}: {
  roles: OrganizationRole[];
  superAdminUserCount: number;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<OrganizationRole[]>(initialRoles);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<RoleEditorSaveResult>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;

  const openEditor = (role: RoleSummary | null) => {
    setSelectedRoleId(role?.id ?? null);
    setSaveResult(null);
    setEditorOpen(true);
  };

  const save = async (submission: RoleEditorSubmission) => {
    setSubmitting(true);
    try {
      const result = await saveOrganizationRoleAction(submission);
      if (result.kind === "confirmation_required") {
        setSaveResult({
          affectedUserCount: result.affectedUserCount,
          kind: "confirmation_required",
          submission,
        });
        return;
      }
      if (result.kind === "stale") {
        setSaveResult({ kind: "stale" });
        return;
      }
      if (result.kind === "error") {
        setSaveResult(result);
        return;
      }

      const permissions = result.permissions ?? submission.permissions;
      const persisted: OrganizationRole = {
        assignedUserCount: selectedRole?.assignedUserCount ?? 0,
        id: result.roleId,
        name: submission.name,
        pendingInvitationCount: selectedRole?.pendingInvitationCount ?? 0,
        permissions,
        status: selectedRole?.status ?? "active",
        version: result.version ?? selectedRole?.version ?? 1,
      };
      setRoles((current) => {
        const exists = current.some((role) => role.id === persisted.id);
        return exists
          ? current.map((role) => (role.id === persisted.id ? persisted : role))
          : [...current, persisted];
      });
      setSelectedRoleId(persisted.id);
      setSaveResult(null);
      router.refresh();
    } catch {
      setSaveResult({ kind: "error", message: "The role could not be saved." });
    } finally {
      setSubmitting(false);
    }
  };

  const duplicate = async (roleId: string) => {
    setSubmitting(true);
    try {
      const result = await duplicateOrganizationRoleAction(roleId);
      if (result.kind === "error" || result.kind === "stale") {
        setSelectedRoleId(roleId);
        setEditorOpen(true);
        setSaveResult(result);
      } else {
        setEditorOpen(false);
        router.refresh();
      }
    } catch {
      setSaveResult({ kind: "error", message: "The role could not be duplicated." });
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (request: RoleArchiveRequest) => {
    setSubmitting(true);
    try {
      const result = await archiveOrganizationRoleAction(request);
      if (result.kind === "stale") {
        setSaveResult(result);
        return;
      }
      if (result.kind === "error") {
        setSaveResult(result);
        return;
      }
      setRoles((current) =>
        current.map((role) =>
          role.id === request.id
            ? { ...role, status: "archived", version: role.version + 1 }
            : role,
        ),
      );
      setEditorOpen(false);
      router.refresh();
    } catch {
      setSaveResult({ kind: "error", message: "The role could not be archived." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-3 px-4 py-4 sm:px-6">
      <RoleRegister
        onDuplicateRole={(role) => void duplicate(role.id)}
        onManageRole={openEditor}
        onNewRole={() => openEditor(null)}
        roles={roles}
        superAdminUserCount={superAdminUserCount}
      />
      <RoleEditor
        onArchive={(request) => void archive(request)}
        onClose={() => setEditorOpen(false)}
        onDuplicate={(roleId) => void duplicate(roleId)}
        onReload={() => {
          setSaveResult(null);
          router.refresh();
        }}
        onSave={(submission) => void save(submission)}
        open={editorOpen}
        role={selectedRole as EditableRole | null}
        saveResult={saveResult}
        submitting={submitting}
      />
    </div>
  );
}
