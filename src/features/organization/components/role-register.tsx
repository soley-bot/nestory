"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsSectionHeader } from "./settings-section-header";

export type RoleSummary = {
  assignedUserCount: number;
  id: string;
  name: string;
  pendingInvitationCount: number;
  status: "active" | "archived";
  version: number;
};

type RoleRegisterProps = {
  onDuplicateRole: (role: RoleSummary) => void;
  onManageRole: (role: RoleSummary) => void;
  onNewRole: () => void;
  roles: readonly RoleSummary[];
  superAdminUserCount: number;
};

export function RoleRegister({
  onDuplicateRole,
  onManageRole,
  onNewRole,
  roles,
  superAdminUserCount,
}: RoleRegisterProps) {
  return (
    <Card className="min-w-0" size="sm">
      <CardHeader className="border-b">
        <SettingsSectionHeader
          action={<Button onClick={onNewRole}>New role</Button>}
          description="Access profiles available to workspace members."
          title="Roles"
        />
      </CardHeader>
      <CardContent className="p-0">
        <Table scrollRegionLabel="Workspace roles">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3">Role</TableHead>
              <TableHead className="px-3">Assigned users</TableHead>
              <TableHead className="px-3">Status</TableHead>
              <TableHead className="px-3 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="px-3 font-medium">Super Admin</TableCell>
              <TableCell className="px-3 text-muted-foreground">
                {formatUserCount(superAdminUserCount)}
              </TableCell>
              <TableCell className="px-3">
                <Badge tone="neutral">Protected</Badge>
              </TableCell>
              <TableCell className="px-3" />
            </TableRow>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell className="p-0" colSpan={4}>
                  <EmptyState
                    body="Create a role to control what people can do in a branch."
                    className="min-h-32"
                    kind="empty"
                    title="No custom roles yet"
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="px-3 font-medium">{role.name}</TableCell>
                <TableCell className="px-3 text-muted-foreground">
                  <span className="block">
                    {formatUserCount(role.assignedUserCount)}
                  </span>
                  {role.pendingInvitationCount > 0 ? (
                    <span className="block text-xs">
                      {formatPendingInvitationCount(
                        role.pendingInvitationCount,
                      )}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-3">
                  <Badge
                    tone={role.status === "active" ? "success" : "neutral"}
                  >
                    {role.status === "active" ? "Active" : "Archived"}
                  </Badge>
                </TableCell>
                <TableCell className="px-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      aria-label={`Duplicate ${role.name}`}
                      onClick={() => onDuplicateRole(role)}
                      size="xs"
                      variant="ghost"
                    >
                      Duplicate
                    </Button>
                    <Button
                      aria-label={`Manage ${role.name}`}
                      onClick={() => onManageRole(role)}
                      size="xs"
                      variant="outline"
                    >
                      Manage
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function formatUserCount(count: number) {
  return `${count} ${count === 1 ? "user" : "users"}`;
}

function formatPendingInvitationCount(count: number) {
  return `${count} pending ${count === 1 ? "invitation" : "invitations"}`;
}
