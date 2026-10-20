import type { OrdinaryAccessReadiness } from "./ordinary-access";

export const ordinaryAccessTestOrganizationId = "11111111-1111-4111-8111-111111111111";
const assignment = {
  branch_id: "22222222-2222-4222-8222-222222222222",
  branch_name: "North branch",
  role_id: "33333333-3333-4333-8333-333333333333",
  role_name: "Property reader",
  permission_keys: ["properties.view"] as const,
};

export function ordinaryAccessTestReadiness(): OrdinaryAccessReadiness {
  return {
    organization_id: ordinaryAccessTestOrganizationId,
    authorization_version: 3,
    ordinary_access_enabled: false,
    activation_ready: true,
    blockers: [],
    impact_fingerprint: "a".repeat(64),
    active_branch_count: 1,
    property_count: 2,
    unscoped_property_count: 0,
    conflicting_record_count: 0,
    ordinary_member_count: 2,
    live_ordinary_invitation_count: 1,
    impact_memberships: [
      {
        ...assignment, permission_keys: [...assignment.permission_keys],
        membership_id: "44444444-4444-4444-8444-444444444444",
        user_id: "55555555-5555-4555-8555-555555555555",
        email: "staff-one@example.com",
      },
      {
        ...assignment, permission_keys: [...assignment.permission_keys],
        membership_id: "66666666-6666-4666-8666-666666666666",
        user_id: "77777777-7777-4777-8777-777777777777",
        email: "staff-two@example.com",
      },
    ],
    impact_invitations: [{
      ...assignment, permission_keys: [...assignment.permission_keys],
      invitation_id: "88888888-8888-4888-8888-888888888888",
      email: "invited@example.com",
      status: "pending",
    }],
  };
}
