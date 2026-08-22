"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DraftActionBar, type DraftStatus } from "@/components/ui/draft-action-bar";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer, useDrawerDraftGuard } from "@/components/ui/side-drawer";
import {
  archiveOrganizationBranchAction,
  archiveOrganizationTeamAction,
  restoreOrganizationBranchAction,
  restoreOrganizationTeamAction,
  updateOrganizationBranchAction,
  updateOrganizationTeamAction,
} from "@/features/organization/actions";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";

type SharedProps = {
  canManageStructure: boolean;
  onClose: () => void;
  open: boolean;
};

export function BranchManageDrawer({
  branch,
  canManageStructure,
  onClose,
  open,
}: SharedProps & { branch: OrganizationBranch }) {
  const [values, setValues] = useState(() => branchValues(branch));
  const [status, setStatus] = useState<DraftStatus>("clean");
  const [message, setMessage] = useState<string>();

  const discard = useCallback(() => {
    setValues(branchValues(branch));
    setStatus("clean");
    setMessage(undefined);
  }, [branch]);
  const archived = Boolean(branch.archivedAt);
  const setField = (field: "address" | "code" | "name", value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setStatus("dirty");
    setMessage(undefined);
  };
  const save = async () => {
    setStatus("saving");
    const result = await updateOrganizationBranchAction({ id: branch.id, ...values });
    setMessage(result.message);
    setStatus(result.kind === "saved" ? "saved" : "error");
  };
  const changeLifecycle = async () => {
    setStatus("saving");
    const result = archived
      ? await restoreOrganizationBranchAction(branch.id)
      : await archiveOrganizationBranchAction(branch.id);
    setMessage(result.message);
    setStatus(result.kind === "saved" ? "saved" : "error");
  };

  return (
    <SideDrawer onClose={onClose} open={open} title={`Manage ${branch.name}`}>
      <ManageDrawerGuard onClose={onClose} onDiscard={discard} status={status} />
      <div className="flex min-h-full flex-col">
        <div className="px-5 py-5">
          <FormSection title="Branch details">
            <div className="grid gap-3 sm:grid-cols-2">
              <StructureField disabled={archived || !canManageStructure || status === "saving"} label="Name" name="branch-manage-name" onChange={(value) => setField("name", value)} value={values.name} />
              <StructureField disabled={archived || !canManageStructure || status === "saving"} label="Code" name="branch-manage-code" onChange={(value) => setField("code", value)} value={values.code} />
            </div>
            <StructureField disabled={archived || !canManageStructure || status === "saving"} label="Address" name="branch-manage-address" onChange={(value) => setField("address", value)} value={values.address} />
          </FormSection>
        </div>

        <div className="mt-auto space-y-3 border-t border-border px-5 py-4">
          <ConsequencePanel
            id="branch-manage-impact"
            rows={[
              { label: "Branch", value: `${branch.code} · ${branch.name}` },
              { label: "Current state", value: archived ? "Archived" : "Active" },
              { label: "Records removed", value: "None" },
            ]}
            summary="Archiving is blocked while this branch has assigned access, active properties, teams, person links, maintenance work, recurrence, or pending scoped records. Nothing is deleted."
            title="Branch impact"
            variant="inline"
          />
          <Button
            className="w-full"
            disabled={!canManageStructure || status === "saving"}
            onClick={() => void changeLifecycle()}
            type="button"
            variant="outline"
          >
            {archived ? "Restore branch" : "Archive branch"}
          </Button>
        </div>

        <DraftActionBar
          describedBy="branch-manage-impact"
          disabledReason={archived ? "Restore this branch before editing." : undefined}
          onDiscard={discard}
          onSave={() => void save()}
          saveLabel="Save"
          status={status}
          statusMessage={message}
        />
      </div>
    </SideDrawer>
  );
}

export function TeamManageDrawer({
  activeBranches,
  canManageStructure,
  onClose,
  open,
  staff,
  team,
}: SharedProps & {
  activeBranches: OrganizationBranch[];
  staff: OrganizationPersonOption[];
  team: OrganizationTeam;
}) {
  const [values, setValues] = useState(() => teamValues(team));
  const [status, setStatus] = useState<DraftStatus>("clean");
  const [message, setMessage] = useState<string>();

  const discard = useCallback(() => {
    setValues(teamValues(team));
    setStatus("clean");
    setMessage(undefined);
  }, [team]);
  const archived = Boolean(team.archivedAt);
  const setField = (field: "branchId" | "managerPersonId" | "name", value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setStatus("dirty");
    setMessage(undefined);
  };
  const save = async () => {
    setStatus("saving");
    const result = await updateOrganizationTeamAction({
      branchId: values.branchId || null,
      id: team.id,
      managerPersonId: values.managerPersonId || null,
      name: values.name,
    });
    setMessage(result.message);
    setStatus(result.kind === "saved" ? "saved" : "error");
  };
  const changeLifecycle = async () => {
    setStatus("saving");
    const result = archived
      ? await restoreOrganizationTeamAction(team.id)
      : await archiveOrganizationTeamAction(team.id);
    setMessage(result.message);
    setStatus(result.kind === "saved" ? "saved" : "error");
  };

  return (
    <SideDrawer onClose={onClose} open={open} title={`Manage ${team.name}`}>
      <ManageDrawerGuard onClose={onClose} onDiscard={discard} status={status} />
      <div className="flex min-h-full flex-col">
        <div className="px-5 py-5">
          <FormSection title="Team details">
            <StructureField disabled={archived || !canManageStructure || status === "saving"} label="Name" name="team-manage-name" onChange={(value) => setField("name", value)} value={values.name} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-sm font-medium text-foreground">
                <span>Branch</span>
                <SelectControl ariaLabel="Branch" className="mt-1" disabled={archived || !canManageStructure || status === "saving"} onValueChange={(value) => setField("branchId", value)} options={[{ label: "All branches", value: "" }, ...activeBranches.map((branch) => ({ label: `${branch.code} - ${branch.name}`, value: branch.id }))]} value={values.branchId} />
              </label>
              <label className="block min-w-0 text-sm font-medium text-foreground">
                <span>Manager</span>
                <SelectControl ariaLabel="Manager" className="mt-1" disabled={archived || !canManageStructure || status === "saving"} onValueChange={(value) => setField("managerPersonId", value)} options={[{ label: "No manager", value: "" }, ...staff.map((person) => ({ label: person.label, value: person.id }))]} value={values.managerPersonId} />
              </label>
            </div>
          </FormSection>
        </div>

        <div className="mt-auto space-y-3 border-t border-border px-5 py-4">
          <ConsequencePanel
            id="team-manage-impact"
            rows={[
              { label: "Team", value: team.name },
              { label: "Current state", value: archived ? "Archived" : "Active" },
              { label: "Access changes", value: "None" },
            ]}
            summary="Archiving keeps this team and its historical label. Workspace access and people stay unchanged."
            title="Team impact"
            variant="inline"
          />
          <Button className="w-full" disabled={!canManageStructure || status === "saving"} onClick={() => void changeLifecycle()} type="button" variant="outline">
            {archived ? "Restore team" : "Archive team"}
          </Button>
        </div>

        <DraftActionBar describedBy="team-manage-impact" disabledReason={archived ? "Restore this team before editing." : undefined} onDiscard={discard} onSave={() => void save()} saveLabel="Save" status={status} statusMessage={message} />
      </div>
    </SideDrawer>
  );
}

function StructureField({ disabled, label, name, onChange, value }: { disabled: boolean; label: string; name: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block min-w-0 text-sm font-medium text-foreground" htmlFor={name}>
      <span>{label}</span>
      <Input className="mt-1" disabled={disabled} id={name} onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function branchValues(branch: OrganizationBranch) {
  return { address: branch?.address ?? "", code: branch?.code ?? "", name: branch?.name ?? "" };
}

function teamValues(team: OrganizationTeam) {
  return { branchId: team?.branchId ?? "", managerPersonId: team?.managerPersonId ?? "", name: team?.name ?? "" };
}

function ManageDrawerGuard({
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
