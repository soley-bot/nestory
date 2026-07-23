export type WorkspaceAccessRole = "admin" | "manager" | "member";

type MembershipAccessSource = {
  branchId: string | null;
  email: string | null;
  id: string;
  personId: string | null;
  role: WorkspaceAccessRole;
};

type InvitationAccessSource = {
  branchId: string | null;
  email: string;
  expiresAt: string;
  id: string;
  invitedAt: string;
  lastSentAt: string | null;
  personId: string | null;
  role: WorkspaceAccessRole;
  status: "expired" | "pending" | "send_failed";
};

type AccessBranchSource = {
  id: string;
  name: string;
};

export type OrganizationPersonAccessStatus =
  | {
      primaryAction: "grant_access";
      state: "no_access";
    }
  | {
      branchId: string | null;
      email: string;
      expiresAt: string;
      invitationId: string;
      lastSentAt: string | null;
      primaryAction: "review_invitation";
      role: WorkspaceAccessRole;
      scopeLabel: string;
      state: "invitation_pending";
    }
  | {
      branchId: string | null;
      email: string;
      expiresAt: string;
      invitationId: string;
      lastSentAt: string | null;
      primaryAction: "retry_invitation";
      role: WorkspaceAccessRole;
      scopeLabel: string;
      state: "delivery_failed";
    }
  | {
      branchId: string | null;
      email: string;
      expiresAt: string;
      invitationId: string;
      lastSentAt: string | null;
      primaryAction: "review_invitation";
      role: WorkspaceAccessRole;
      scopeLabel: string;
      state: "expired";
    }
  | {
      branchId: string | null;
      email: string | null;
      membershipId: string;
      primaryAction: "manage_access";
      role: WorkspaceAccessRole;
      scopeLabel: string;
      state: "active_workspace_access";
    };

type InvitationState = Exclude<
  OrganizationPersonAccessStatus["state"],
  "active_workspace_access" | "no_access"
>;

const invitationPriority: Record<InvitationState, number> = {
  delivery_failed: 3,
  invitation_pending: 2,
  expired: 1,
};

export function buildAccessByPersonId(
  personIds: string[],
  memberships: MembershipAccessSource[],
  invitations: InvitationAccessSource[],
  now = new Date(),
  branches: AccessBranchSource[] = [],
): Record<string, OrganizationPersonAccessStatus> {
  const requestedPersonIds = Array.from(new Set(personIds));
  const requestedPersonIdSet = new Set(requestedPersonIds);
  const result: Record<string, OrganizationPersonAccessStatus> = Object.fromEntries(
    requestedPersonIds.map((personId) => [
      personId,
      {
        primaryAction: "grant_access",
        state: "no_access",
      } satisfies OrganizationPersonAccessStatus,
    ]),
  );

  const invitationsByPersonId = new Map<string, InvitationAccessSource[]>();
  for (const invitation of invitations) {
    if (!invitation.personId || !requestedPersonIdSet.has(invitation.personId)) {
      continue;
    }

    const personInvitations = invitationsByPersonId.get(invitation.personId) ?? [];
    personInvitations.push(invitation);
    invitationsByPersonId.set(invitation.personId, personInvitations);
  }

  for (const personId of requestedPersonIds) {
    const invitation = chooseRelevantInvitation(
      invitationsByPersonId.get(personId) ?? [],
      now,
    );
    if (invitation) {
      result[personId] = toInvitationStatus(invitation, now, branches);
    }
  }

  const membershipByPersonId = new Map<string, MembershipAccessSource>();
  for (const membership of memberships) {
    if (!membership.personId || !requestedPersonIdSet.has(membership.personId)) {
      continue;
    }

    const current = membershipByPersonId.get(membership.personId);
    if (!current || membership.id.localeCompare(current.id) < 0) {
      membershipByPersonId.set(membership.personId, membership);
    }
  }

  for (const [personId, membership] of membershipByPersonId) {

    result[personId] = {
      branchId: membership.branchId,
      email: membership.email,
      membershipId: membership.id,
      primaryAction: "manage_access",
      role: membership.role,
      scopeLabel: getScopeLabel(membership.branchId, membership.role, branches),
      state: "active_workspace_access",
    };
  }

  return result;
}

function chooseRelevantInvitation(
  invitations: InvitationAccessSource[],
  now: Date,
): InvitationAccessSource | undefined {
  return invitations.toSorted((left, right) => {
    const statePriority =
      invitationPriority[toInvitationState(right, now)] -
      invitationPriority[toInvitationState(left, now)];
    if (statePriority !== 0) {
      return statePriority;
    }

    const invitedAtOrder = safeTimestamp(right.invitedAt) - safeTimestamp(left.invitedAt);
    if (invitedAtOrder !== 0) {
      return invitedAtOrder;
    }

    return left.id.localeCompare(right.id);
  })[0];
}

function toInvitationStatus(
  invitation: InvitationAccessSource,
  now: Date,
  branches: AccessBranchSource[],
): OrganizationPersonAccessStatus {
  const shared = {
    branchId: invitation.branchId,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    invitationId: invitation.id,
    lastSentAt: invitation.lastSentAt,
    role: invitation.role,
    scopeLabel: getScopeLabel(invitation.branchId, invitation.role, branches),
  };

  switch (toInvitationState(invitation, now)) {
    case "delivery_failed":
      return {
        ...shared,
        primaryAction: "retry_invitation",
        state: "delivery_failed",
      };
    case "expired":
      return {
        ...shared,
        primaryAction: "review_invitation",
        state: "expired",
      };
    case "invitation_pending":
      return {
        ...shared,
        primaryAction: "review_invitation",
        state: "invitation_pending",
      };
  }
}

function toInvitationState(
  invitation: InvitationAccessSource,
  now: Date,
): InvitationState {
  const expiration = Date.parse(invitation.expiresAt);
  if (
    invitation.status === "expired" ||
    (Number.isFinite(expiration) && expiration <= now.getTime())
  ) {
    return "expired";
  }

  return invitation.status === "send_failed"
    ? "delivery_failed"
    : "invitation_pending";
}

function safeTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getScopeLabel(
  branchId: string | null,
  role: WorkspaceAccessRole,
  branches: AccessBranchSource[] = [],
) {
  if (role === "admin" || !branchId) {
    return "All branches";
  }

  return branches.find((branch) => branch.id === branchId)?.name ?? "Assigned branch";
}
