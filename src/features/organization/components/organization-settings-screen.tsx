"use client";

import { useActionState } from "react";
import { Building2, Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  createBranchAction,
  createTeamAction,
  type OrganizationActionState,
} from "@/features/organization/actions";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";

const initialState: OrganizationActionState = {};

export function OrganizationSettingsScreen({
  branches,
  organizationName,
  staff,
  teams,
}: {
  branches: OrganizationBranch[];
  organizationName: string;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
}) {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SettingsFact label="Workspace" value={organizationName} />
        <SettingsFact label="Branches" value={String(branches.length)} />
        <SettingsFact label="Teams" value={String(teams.length)} />
        <SettingsFact label="Org model" value="Branches + teams" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={15} />
              Branches
            </h2>
          </div>
          <div className="divide-y divide-border">
            {branches.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted">No branches yet.</p>
            ) : (
              branches.map((branch) => (
                <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)_120px] sm:items-center" key={branch.id}>
                  <p className="font-medium">{branch.code}</p>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{branch.name}</p>
                    <p className="truncate text-xs text-muted">
                      {branch.address ?? "No address"}
                    </p>
                  </div>
                  <p className="text-xs font-medium uppercase text-muted">
                    {branch.status}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <BranchForm />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound size={15} />
              Teams
            </h2>
          </div>
          <div className="divide-y divide-border">
            {teams.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted">No teams yet.</p>
            ) : (
              teams.map((team) => (
                <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_160px_160px] sm:items-center" key={team.id}>
                  <p className="truncate font-medium">{team.name}</p>
                  <p className="truncate text-sm text-muted">
                    {branches.find((branch) => branch.id === team.branchId)?.code ??
                      "All branches"}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {staff.find((person) => person.id === team.managerPersonId)
                      ?.label ?? "No manager"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <TeamForm branches={branches} staff={staff} />
      </section>
    </div>
  );
}

function BranchForm() {
  const [state, action, pending] = useActionState(createBranchAction, initialState);

  return (
    <form action={action} className="rounded-md border border-border bg-surface p-3">
      <h2 className="text-sm font-semibold">Add branch</h2>
      <div className="mt-3 space-y-3">
        <Input name="name" placeholder="Branch name" required />
        <Input name="code" placeholder="Code" required />
        <Input name="address" placeholder="Address" />
        <Button disabled={pending} type="submit" variant="primary">
          <Plus size={15} />
          {pending ? "Adding..." : "Add branch"}
        </Button>
        <ActionMessage message={state.message} status={state.status} />
      </div>
    </form>
  );
}

function TeamForm({
  branches,
  staff,
}: {
  branches: OrganizationBranch[];
  staff: OrganizationPersonOption[];
}) {
  const [state, action, pending] = useActionState(createTeamAction, initialState);

  return (
    <form action={action} className="rounded-md border border-border bg-surface p-3">
      <h2 className="text-sm font-semibold">Add team</h2>
      <div className="mt-3 space-y-3">
        <Input name="name" placeholder="Team name" required />
        <SelectControl
          ariaLabel="Branch"
          name="branchId"
          options={[
            { label: "All branches", value: "" },
            ...branches.map((branch) => ({
              label: `${branch.code} - ${branch.name}`,
              value: branch.id,
            })),
          ]}
        />
        <SelectControl
          ariaLabel="Manager"
          name="managerPersonId"
          options={[
            { label: "No manager", value: "" },
            ...staff.map((person) => ({
              label: person.label,
              value: person.id,
            })),
          ]}
        />
        <Button disabled={pending} type="submit" variant="primary">
          <Plus size={15} />
          {pending ? "Adding..." : "Add team"}
        </Button>
        <ActionMessage message={state.message} status={state.status} />
      </div>
    </form>
  );
}

function SettingsFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-2.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function ActionMessage({
  message,
  status,
}: {
  message?: string;
  status?: "error" | "success";
}) {
  if (!message) {
    return null;
  }

  return (
    <p className={status === "error" ? "text-sm text-danger" : "text-sm text-success"}>
      {message}
    </p>
  );
}
