"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  OrganizationBranch,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationStaffOption,
} from "@/features/organization/data";

import {
  filterAccessRegister,
  type AccessRegisterView,
} from "./access-register-model";

type AccessRegisterProps = {
  activeView: AccessRegisterView;
  branches: OrganizationBranch[];
  invitations: OrganizationInvitation[];
  members: OrganizationMembership[];
  noAccessStaff: OrganizationStaffOption[];
  onGrantStaff: (person: OrganizationStaffOption) => void;
  onViewChange: (view: AccessRegisterView) => void;
  people: OrganizationStaffOption[];
  renderInvitationRow: (invitation: OrganizationInvitation) => ReactNode;
  renderMemberRow: (member: OrganizationMembership) => ReactNode;
};

const roleOptions = [
  { label: "All access levels", value: "all" },
  { label: "Super Admin", value: "super_admin" },
  { label: "Finance Manager", value: "finance_manager" },
  { label: "Finance Member", value: "finance_member" },
  { label: "Operations Manager", value: "operations_manager" },
  { label: "Operations Member", value: "operations_member" },
];

export function AccessRegister({
  activeView,
  branches,
  invitations,
  members,
  noAccessStaff,
  onGrantStaff,
  onViewChange,
  people,
  renderInvitationRow,
  renderMemberRow,
}: AccessRegisterProps) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [scope, setScope] = useState("all");
  const filtered = useMemo(
    () =>
      filterAccessRegister({
        branches,
        invitations,
        members,
        people,
        query,
        role,
        scope,
        staff: noAccessStaff,
      }),
    [branches, invitations, members, noAccessStaff, people, query, role, scope],
  );
  const filteredViewIsEmpty =
    activeView === "active"
      ? filtered.members.length === 0
      : activeView === "invitations"
        ? filtered.invitations.length === 0
        : filtered.staff.length === 0;
  const hasFilters = query.trim().length > 0 || role !== "all" || scope !== "all";

  return (
    <section
      className="min-w-0 overflow-hidden rounded-lg border bg-card"
      data-testid="access-register"
    >
      <Tabs
        onValueChange={(value) => onViewChange(value as AccessRegisterView)}
        value={activeView}
      >
        <div className="min-w-0 border-b px-3 pt-2 sm:px-4">
          <TabsList
            aria-label="Workspace access views"
            className="max-w-full"
            variant="line"
          >
            <TabsTrigger className="gap-2 px-2.5" value="active">
              Active
              <Badge className="h-5 min-w-5 px-1.5 text-xs" tone="neutral">
                {members.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger className="gap-2 px-2.5" value="invitations">
              Invitations
              <Badge className="h-5 min-w-5 px-1.5 text-xs" tone="neutral">
                {invitations.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger className="gap-2 px-2.5" value="no_access">
              No access
              <Badge className="h-5 min-w-5 px-1.5 text-xs" tone="neutral">
                {noAccessStaff.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="grid gap-2 py-3 sm:grid-cols-[minmax(14rem,1fr)_11rem_11rem]">
            <label className="relative min-w-0">
              <span className="sr-only">Search workspace access</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search workspace access"
                className="h-8 pl-8"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                type="search"
                value={query}
              />
            </label>
            <SelectControl
              ariaLabel="Filter by access level"
              className="h-8"
              disabled={activeView === "no_access"}
              onValueChange={setRole}
              options={roleOptions}
              value={role}
            />
            <SelectControl
              ariaLabel="Filter by access scope"
              className="h-8"
              disabled={activeView === "no_access"}
              onValueChange={setScope}
              options={[
                { label: "All scopes", value: "all" },
                { label: "Organization-wide", value: "organization" },
                ...branches.map((branch) => ({
                  label: branch.name,
                  value: branch.id,
                })),
              ]}
              value={scope}
            />
          </div>
        </div>

        <TabsContent value="active">
          {filtered.members.length > 0 ? (
            <Table scrollRegionLabel="Active workspace access">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3">Member</TableHead>
                  <TableHead className="px-3">Access level</TableHead>
                  <TableHead className="hidden px-3 lg:table-cell">Scope</TableHead>
                  <TableHead className="hidden px-3 xl:table-cell">Staff record</TableHead>
                  <TableHead className="px-3"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              {filtered.members.map(renderMemberRow)}
            </Table>
          ) : (
            <RegisterEmptyState filtered={hasFilters} label="active access" />
          )}
        </TabsContent>

        <TabsContent value="invitations">
          {filtered.invitations.length > 0 ? (
            <Table scrollRegionLabel="Workspace invitations">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3">Invitation</TableHead>
                  <TableHead className="px-3">Access level</TableHead>
                  <TableHead className="hidden px-3 lg:table-cell">Scope</TableHead>
                  <TableHead className="hidden px-3 xl:table-cell">Staff record</TableHead>
                  <TableHead className="hidden px-3 md:table-cell">Delivery</TableHead>
                  <TableHead className="px-3"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              {filtered.invitations.map(renderInvitationRow)}
            </Table>
          ) : (
            <RegisterEmptyState filtered={hasFilters} label="invitations" />
          )}
        </TabsContent>

        <TabsContent value="no_access">
          {filtered.staff.length > 0 ? (
            <Table scrollRegionLabel="Staff without workspace access">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3">Staff member</TableHead>
                  <TableHead className="hidden px-3 sm:table-cell">Staff email</TableHead>
                  <TableHead className="px-3"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.staff.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="px-3 font-medium">{person.label}</TableCell>
                    <TableCell className="hidden px-3 text-muted-foreground sm:table-cell">
                      {person.primaryEmail ?? "No email"}
                    </TableCell>
                    <TableCell className="w-px px-3 text-right">
                      <Button
                        aria-label={`Add access for ${person.label}`}
                        onClick={() => onGrantStaff(person)}
                        size="sm"
                        variant="outline"
                      >
                        Add access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <RegisterEmptyState filtered={hasFilters} label="Staff without access" />
          )}
        </TabsContent>
      </Tabs>
      {filteredViewIsEmpty && hasFilters ? (
        <div className="sr-only" aria-live="polite">No matching records</div>
      ) : null}
    </section>
  );
}

function RegisterEmptyState({ filtered, label }: { filtered: boolean; label: string }) {
  return (
    <EmptyState
      className="min-h-44"
      kind={filtered ? "filtered" : "empty"}
      title={filtered ? `No matching ${label}` : `No ${label}`}
    />
  );
}
