import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatWorkspaceAccessRole } from "@/features/organization/access-status";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import type { PeopleBadgeTone } from "@/features/people/people.types";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

export function WorkspaceAccessStatus({
  className,
  personId,
  personName,
  status,
}: {
  className?: string;
  personId: string;
  personName: string;
  status: OrganizationPersonAccessStatus;
}) {
  const presentation = getWorkspaceAccessPresentation(personId, status);

  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge className="max-w-full px-2 text-xs" tone={presentation.tone}>
          <span className="truncate">{presentation.stateLabel}</span>
        </Badge>
        <span className="min-w-0 truncate text-xs text-muted">
          {presentation.detail}
        </span>
      </div>
      <Link
        aria-label={`${presentation.actionLabel} for ${personName}`}
        className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
        href={presentation.href}
        prefetch={false}
      >
        {presentation.actionLabel}
      </Link>
    </div>
  );
}

export function getWorkspaceAccessPresentation(
  personId: string,
  status: OrganizationPersonAccessStatus,
): {
  actionLabel: string;
  detail: string;
  href: string;
  stateLabel: string;
  tone: PeopleBadgeTone;
} {
  const params = new URLSearchParams({ personId });

  switch (status.state) {
    case "active_workspace_access":
      params.set("memberId", status.membershipId);
      return {
        actionLabel: "Manage workspace access",
        detail: `${formatWorkspaceAccessRole(status.role)} / ${status.scopeLabel}`,
        href: `/users-roles?${params.toString()}`,
        stateLabel: "Active access",
        tone: "success",
      };
    case "delivery_failed":
      params.set("invitationId", status.invitationId);
      return {
        actionLabel: "Review and resend",
        detail: `${status.email} / Delivery needs attention.`,
        href: `/users-roles?${params.toString()}`,
        stateLabel: "Invitation failed",
        tone: "danger",
      };
    case "expired":
      params.set("invitationId", status.invitationId);
      return {
        actionLabel: "Review invitation",
        detail: `Expired ${formatDate(status.expiresAt)}`,
        href: `/users-roles?${params.toString()}`,
        stateLabel: "Invitation expired",
        tone: "warning",
      };
    case "invitation_pending":
      params.set("invitationId", status.invitationId);
      return {
        actionLabel: "Review invitation",
        detail: status.lastSentAt
          ? `${status.email} / Last sent ${formatDate(status.lastSentAt)}`
          : `${status.email} / Awaiting acceptance.`,
        href: `/users-roles?${params.toString()}`,
        stateLabel: "Pending invitation",
        tone: "accent",
      };
    case "no_access":
      return {
        actionLabel: "Grant workspace access",
        detail: "Operational Staff record only.",
        href: `/users-roles?${params.toString()}`,
        stateLabel: "No access",
        tone: "neutral",
      };
  }
}
