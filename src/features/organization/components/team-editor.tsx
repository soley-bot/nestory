"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { UsersRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DraftActionBar } from "@/components/ui/draft-action-bar";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer, useDrawerDraftGuard } from "@/components/ui/side-drawer";
import { createTeamAction } from "@/features/organization/actions";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";
import { useSettingsDraft } from "@/features/organization/components/use-settings-draft";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
import type { SettingsEditorHandle } from "@/features/organization/components/branch-editor";
import { SettingsSectionHeader } from "@/features/organization/components/settings-section-header";
import { TeamManageDrawer } from "@/features/organization/components/structure-manage-drawers";

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
  focusServerError: boolean;
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
      focusServerError,
      onDraftStatusChange,
      organizationName,
      staff,
      teams,
    },
    controllerRef,
  ) {
    const formRef = useRef<HTMLFormElement>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [managedTeam, setManagedTeam] = useState<OrganizationTeam | null>(null);
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
    const activeBranches = useMemo(
      () => branches.filter((branch) => !branch.archivedAt && branch.status === "active"),
      [branches],
    );
    const selectedManager = staff.find(
      (person) => person.id === draft.values.managerPersonId,
    );
    const serverError =
      draft.status === "error" && draft.resultMessage
        ? `Team not saved: ${draft.resultMessage}`
        : undefined;
    const closeDrawer = useCallback(() => {
      setDrawerOpen(false);
    }, []);

    useImperativeHandle(controllerRef, () => ({ discard: draft.discard }), [
      draft.discard,
    ]);
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
        <Card className="min-w-0" data-testid="settings-editor" size="sm">
          <CardHeader className="border-b">
            <SettingsSectionHeader
              action={
                <Button onClick={() => setDrawerOpen(true)}>Add team</Button>
              }
              description="Operating groups and managers."
              title="Teams"
            />
          </CardHeader>

          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5 text-sm">
              <p className="text-muted-foreground">
                Teams do not change workspace access.
              </p>
              <Link
                className="font-medium text-primary hover:underline"
                href="/people"
              >
                Open People
              </Link>
            </div>

            {teams.length > 0 ? (
              <div>
                <div className="hidden grid-cols-[minmax(0,1fr)_120px_150px_80px_auto] gap-1 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>Team</span>
                  <span>Scope</span>
                  <span>Manager</span>
                  <span>Status</span>
                  <span className="sr-only">Action</span>
                </div>
                <div className="divide-y divide-border">
                  {teams.map((team) => (
                    <div
                      className="grid min-w-0 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_120px_150px_80px_auto] sm:items-center"
                      key={team.id}
                    >
                      <span className="truncate font-medium">{team.name}</span>
                      <span className="truncate text-muted-foreground">
                        {teamBranchLabel(team.branchId, branches)}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {staff.find(
                          (person) => person.id === team.managerPersonId,
                        )?.label ?? "No manager"}
                      </span>
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {team.archivedAt ? "Archived" : "Active"}
                      </span>
                      <Button
                        aria-label={`Manage team ${team.name}`}
                        onClick={() => setManagedTeam(team)}
                        size="sm"
                        variant="ghost"
                      >
                        Manage
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <UsersRound
                  aria-hidden="true"
                  className="mx-auto mb-3 size-6 opacity-50"
                />
                <p className="font-medium text-foreground">No teams yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <SideDrawer onClose={closeDrawer} open={drawerOpen} title="Add team">
          <TeamDrawerDraftGuard
            onClose={closeDrawer}
            onDiscard={draft.discard}
            status={draft.status}
          />
          <form
            className="flex min-h-full min-w-0 flex-col"
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
            <div className="px-5 py-5">
              <FormSection title="Team details">
                <div className="block min-w-0 text-sm font-medium text-foreground">
                  <label htmlFor="team-name">Name</label>
                  <Input
                    aria-describedby={
                      draft.errors.name ? "team-name-error" : undefined
                    }
                    aria-invalid={draft.errors.name ? "true" : undefined}
                    className="mt-1"
                    disabled={!canManageStructure || draft.status === "saving"}
                    id="team-name"
                    maxLength={120}
                    name="name"
                    onChange={(event) =>
                      draft.setField("name", event.target.value)
                    }
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
                      disabled={
                        !canManageStructure || draft.status === "saving"
                      }
                      name="branchId"
                      onValueChange={(value) =>
                        draft.setField("branchId", value)
                      }
                      options={[
                        { label: "All branches", value: "" },
                        ...activeBranches.map((branch) => ({
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
                      disabled={
                        !canManageStructure || draft.status === "saving"
                      }
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
                  <p className="text-sm text-success">{draft.resultMessage}</p>
                ) : null}
              </FormSection>
            </div>

            <div className="mt-auto w-full border-t border-border px-5 py-4">
              <ConsequencePanel
                id="team-impact"
                rows={[
                  {
                    label: "Scope",
                    value: selectedBranch?.name ?? organizationName,
                  },
                  {
                    label: "Team",
                    value: draft.values.name.trim() || "New team",
                  },
                  { label: "Affected records", value: "1 team" },
                  {
                    label: "Manager link",
                    value: selectedManager?.label ?? "None",
                  },
                  { label: "Access changes", value: "None" },
                  { label: "Draft", value: draftStatusLabel(draft.status) },
                ]}
                summary="Adds one team and an optional manager link. Access stays unchanged."
                title="Team impact"
                variant="inline"
              />
            </div>

            <div className="sticky bottom-0 z-10 w-full">
              <DraftActionBar
                describedBy="team-impact"
                disabledReason={permissionReason}
                focusOnError={focusServerError && Boolean(serverError)}
                onDiscard={draft.discard}
                onSave={() => formRef.current?.requestSubmit()}
                saveLabel="Save"
                status={draft.status}
                statusMessage={serverError ?? draft.statusMessage}
              />
            </div>
          </form>
        </SideDrawer>
        {managedTeam ? (
          <TeamManageDrawer
            activeBranches={activeBranches}
            canManageStructure={canManageStructure}
            key={managedTeam.id}
            onClose={() => setManagedTeam(null)}
            open
            staff={staff}
            team={managedTeam}
          />
        ) : null}
      </>
    );
  },
);

function TeamDrawerDraftGuard({
  onClose,
  onDiscard,
  status,
}: {
  onClose: () => void;
  onDiscard: () => void;
  status: DraftStatus;
}) {
  const discardAndClose = useCallback(() => {
    onDiscard();
    onClose();
  }, [onClose, onDiscard]);
  const guard = useMemo(
    () => ({ onDiscard: discardAndClose, status }),
    [discardAndClose, status],
  );
  useDrawerDraftGuard(guard);

  return null;
}

function validateTeam(values: TeamDraft) {
  return values.name.trim().length < 2
    ? { name: "Name must be at least 2 characters." }
    : {};
}

function draftStatusLabel(status: string) {
  return (
    {
      clean: "No changes",
      dirty: "Unsaved",
      error: "Needs attention",
      saved: "Saved",
      saving: "Saving",
    }[status] ?? status
  );
}

function teamBranchLabel(
  branchId: string | null,
  branches: OrganizationBranch[],
) {
  if (!branchId) return "All branches";
  return branches.find((branch) => branch.id === branchId)?.code ?? "Assigned branch unavailable";
}
