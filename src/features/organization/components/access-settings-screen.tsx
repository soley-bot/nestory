"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Plus, Save, Shield, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  addExistingUserAccessAction,
  updateMemberAccessAction,
  type OrganizationActionState,
} from "@/features/organization/actions";
import type {
  OrganizationBranch,
  OrganizationMembership,
  OrganizationPersonOption,
} from "@/features/organization/data";

const initialState: OrganizationActionState = {};

export function AccessSettingsScreen({
  branches,
  inviteDefaults,
  members,
  people,
}: {
  branches: OrganizationBranch[];
  inviteDefaults?: {
    email?: string;
    personId?: string;
  };
  members: OrganizationMembership[];
  people: OrganizationPersonOption[];
}) {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
      <section className="grid gap-3 lg:grid-cols-3">
        <RoleCard
          body="Full workspace access, settings, people, finance, and structure."
          title="Admin"
        />
        <RoleCard
          body="Can manage operational work and assign tasks to members."
          title="Manager"
        />
        <RoleCard
          body="Read-only work queue for tasks assigned to their staff profile."
          title="Member"
        />
      </section>

      <section className="rounded-md border border-border bg-surface">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus size={15} />
            Add user
          </h2>
        </div>
        <InviteUserForm
          branches={branches}
          defaults={inviteDefaults}
          people={people}
        />
      </section>

      <section className="rounded-md border border-border bg-surface">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Shield size={15} />
            User access
          </h2>
        </div>
        <div className="divide-y divide-border">
          {members.map((member) => (
            <MemberAccessForm
              branches={branches}
              key={member.id}
              member={member}
              people={people}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function InviteUserForm({
  branches,
  defaults,
  people,
}: {
  branches: OrganizationBranch[];
  defaults?: {
    email?: string;
    personId?: string;
  };
  people: OrganizationPersonOption[];
}) {
  const [state, action, pending] = useActionState(
    addExistingUserAccessAction,
    initialState,
  );

  return (
    <form
      action={action}
      className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(170px,1fr)_130px_170px_200px_auto_auto] lg:items-center"
    >
      <Input
        defaultValue={defaults?.email ?? ""}
        name="email"
        placeholder="user@example.com"
        required
        type="email"
      />
      <SelectControl
        ariaLabel="Role"
        defaultValue="member"
        name="role"
        options={[
          { label: "Admin", value: "admin" },
          { label: "Manager", value: "manager" },
          { label: "Member", value: "member" },
        ]}
      />
      <SelectControl
        ariaLabel="Branch"
        defaultValue=""
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
        ariaLabel="Staff person"
        defaultValue={defaults?.personId ?? ""}
        name="personId"
        options={[
          { label: "No staff link", value: "" },
          ...people.map((person) => ({
            label: person.label,
            value: person.id,
          })),
        ]}
      />
      <Button disabled={pending} type="submit" variant="primary">
        <Plus size={15} />
        {pending ? "Adding..." : "Add"}
      </Button>
      <Link
        className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
        href="/staff?action=create"
      >
        <UserPlus size={15} />
        <span className="truncate">Add staff</span>
      </Link>
      {state.message ? (
        <p className="text-xs text-muted lg:col-span-6" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function MemberAccessForm({
  branches,
  member,
  people,
}: {
  branches: OrganizationBranch[];
  member: OrganizationMembership;
  people: OrganizationPersonOption[];
}) {
  const [state, action, pending] = useActionState(
    updateMemberAccessAction,
    initialState,
  );
  const branchLabel =
    branches.find((branch) => branch.id === member.branchId)?.name ?? "All branches";
  const personLabel =
    people.find((person) => person.id === member.personId)?.label ?? "No staff link";
  const accountLabel = member.email ?? personLabel;
  const relationshipLabel = getRelationshipLabel({
    branchLabel,
    personLabel,
    role: member.role,
  });

  return (
    <form
      action={action}
      className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_150px_180px_220px_auto] lg:items-center"
    >
      <input name="memberId" type="hidden" value={member.id} />
      <div className="min-w-0">
        <p className="truncate font-medium">{accountLabel}</p>
        <p className="text-xs text-muted">
          {state.message ? state.message : relationshipLabel}
        </p>
      </div>
      <SelectControl
        ariaLabel="Role"
        defaultValue={member.role}
        name="role"
        options={[
          { label: "Admin", value: "admin" },
          { label: "Manager", value: "manager" },
          { label: "Member", value: "member" },
        ]}
      />
      <SelectControl
        ariaLabel="Branch"
        defaultValue={member.branchId ?? ""}
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
        ariaLabel="Staff person"
        defaultValue={member.personId ?? ""}
        name="personId"
        options={[
          { label: "No staff link", value: "" },
          ...people.map((person) => ({
            label: person.label,
            value: person.id,
          })),
        ]}
      />
      <Button disabled={pending} type="submit" variant="primary">
        <Save size={15} />
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}

function getRelationshipLabel({
  branchLabel,
  personLabel,
  role,
}: {
  branchLabel: string;
  personLabel: string;
  role: OrganizationMembership["role"];
}) {
  if (role === "admin") {
    return "Full access across the organization.";
  }

  if (role === "manager") {
    return `Can assign tasks for ${branchLabel}.`;
  }

  return `${personLabel} receives assigned tasks in their queue.`;
}

function RoleCard({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}
