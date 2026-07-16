"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { UsersRound } from "lucide-react";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DraftActionBar } from "@/components/ui/draft-action-bar";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { createTeamAction } from "@/features/organization/actions";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";
import { useSettingsDraft } from "@/features/organization/components/use-settings-draft";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
import type { SettingsEditorHandle } from "@/features/organization/components/branch-editor";

type TeamDraft = {
  branchId: string;
  managerPersonId: string;
  name: string;
};

const initialTeamDraft: TeamDraft = {
  name: "",
  branchId: "",
  managerPersonId: "",
};

type TeamEditorProps = {
  branches: OrganizationBranch[];
  canManageStructure: boolean;
  onDraftStatusChange: (status: DraftStatus) => void;
  organizationName: string;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
};

export const TeamEditor = forwardRef<SettingsEditorHandle, TeamEditorProps>(
  function TeamEditor(
    {
      branches,
      canManageStructure,
      onDraftStatusChange,
      organizationName,
      staff,
      teams,
    },
    controllerRef,
  ) {
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useSettingsDraft({
    action: createTeamAction,
    errorMessage: "Team not saved",
    initialValues: initialTeamDraft,
    savedMessage: "Team saved",
    savingMessage: "Adding team",
    validate: validateTeam,
  });
  const permissionReason = canManageStructure
    ? undefined
    : "Only administrators can add organization structure.";
  const selectedBranch = branches.find(
    (branch) => branch.id === draft.values.branchId,
  );
  const selectedManager = staff.find(
    (person) => person.id === draft.values.managerPersonId,
  );
  const serverError =
    draft.status === "error" && draft.resultMessage
      ? `Team not saved: ${draft.resultMessage}`
      : undefined;

  useImperativeHandle(
    controllerRef,
    () => ({ discard: draft.discard }),
    [draft.discard],
  );
  useEffect(() => {
    onDraftStatusChange(draft.status);
  }, [draft.status, onDraftStatusChange]);
  useEffect(
    () => () => {
      onDraftStatusChange("clean");
    },
    [onDraftStatusChange],
  );

  return (
    <>
      <section
        className="min-w-0 overflow-hidden rounded-md border border-border bg-surface"
        data-testid="settings-editor"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound aria-hidden="true" size={15} />
              Teams
            </h2>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {teams.length} {teams.length === 1 ? "team" : "teams"}
            </p>
          </div>
        </div>

        {teams.length > 0 ? (
          <div className="divide-y divide-border border-b border-border">
            {teams.map((team) => (
              <div
                className="grid min-w-0 gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_120px_150px] sm:items-center"
                key={team.id}
              >
                <span className="truncate font-medium">{team.name}</span>
                <span className="truncate text-foreground-muted">
                  {branches.find((branch) => branch.id === team.branchId)?.code ??
                    "All branches"}
                </span>
                <span className="truncate text-foreground-muted">
                  {staff.find((person) => person.id === team.managerPersonId)?.label ??
                    "No manager"}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <form
          className="min-w-0 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void draft.submit(() => {
              const control = formRef.current?.elements.namedItem("name");
              if (control instanceof HTMLElement) {
                control.focus();
              }
            });
          }}
          ref={formRef}
        >
          <FormSection title="Add team">
            <div className="block min-w-0 text-sm font-medium text-foreground">
              <label htmlFor="team-name">Name</label>
              <Input
                aria-describedby={draft.errors.name ? "team-name-error" : undefined}
                aria-invalid={draft.errors.name ? "true" : undefined}
                className="mt-1"
                disabled={!canManageStructure || draft.status === "saving"}
                id="team-name"
                maxLength={120}
                name="name"
                onChange={(event) => draft.setField("name", event.target.value)}
                value={draft.values.name}
              />
              {draft.errors.name ? (
                <span
                  className="mt-1 block text-sm font-normal text-danger"
                  id="team-name-error"
                >
                  {draft.errors.name}
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-sm font-medium text-foreground">
                <span>Branch</span>
                <SelectControl
                  ariaLabel="Branch"
                  className="mt-1"
                  disabled={!canManageStructure || draft.status === "saving"}
                  name="branchId"
                  onValueChange={(value) => draft.setField("branchId", value)}
                  options={[
                    { label: "All branches", value: "" },
                    ...branches.map((branch) => ({
                      label: `${branch.code} - ${branch.name}`,
                      value: branch.id,
                    })),
                  ]}
                  value={draft.values.branchId}
                />
              </label>
              <label className="block min-w-0 text-sm font-medium text-foreground">
                <span>Manager</span>
                <SelectControl
                  ariaLabel="Manager"
                  className="mt-1"
                  disabled={!canManageStructure || draft.status === "saving"}
                  name="managerPersonId"
                  onValueChange={(value) =>
                    draft.setField("managerPersonId", value)
                  }
                  options={[
                    { label: "No manager", value: "" },
                    ...staff.map((person) => ({
                      label: person.label,
                      value: person.id,
                    })),
                  ]}
                  value={draft.values.managerPersonId}
                />
              </label>
            </div>
            {draft.status === "saved" && draft.resultMessage ? (
              <p className="text-sm text-success">
                {draft.resultMessage}
              </p>
            ) : null}
          </FormSection>
        </form>

        <div className="sticky bottom-0 z-10">
          <DraftActionBar
            describedBy="team-impact"
            disabledReason={permissionReason}
            focusOnError={Boolean(serverError)}
            onDiscard={draft.discard}
            onSave={() => formRef.current?.requestSubmit()}
            saveLabel="Save"
            status={draft.status}
            statusMessage={serverError ?? draft.statusMessage}
          />
        </div>
      </section>

      <aside
        className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1"
        data-testid="settings-summary"
      >
        <ConsequencePanel
          id="team-impact"
          rows={[
            { label: "Scope", value: selectedBranch?.name ?? organizationName },
            { label: "Team", value: draft.values.name.trim() || "New team" },
            { label: "Affected records", value: "1 team" },
            { label: "Manager link", value: selectedManager?.label ?? "None" },
            { label: "Access changes", value: "None" },
            { label: "Draft", value: draftStatusLabel(draft.status) },
          ]}
          summary="Saving adds one team record and an optional manager link. Existing teams and access remain unchanged."
          title="Team impact"
        />
      </aside>
    </>
  );
  },
);

function validateTeam(values: TeamDraft) {
  return values.name.trim().length < 2
    ? { name: "Name must be at least 2 characters." }
    : {};
}

function draftStatusLabel(status: string) {
  return {
    clean: "No changes",
    dirty: "Unsaved",
    error: "Needs attention",
    saved: "Saved",
    saving: "Saving",
  }[status] ?? status;
}
