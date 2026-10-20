import { z } from "zod";
import { isPermissionKey, type PermissionKey } from "@/lib/auth/permission-catalog";

const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const versionSchema = countSchema.min(1);
const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const assignmentSchema = z.object({
  email: z.string().min(1).nullable(),
  branch_id: z.string().uuid().nullable(),
  branch_name: z.string().min(1).nullable(),
  role_id: z.string().uuid().nullable(),
  role_name: z.string().min(1),
  permission_keys: z.array(z.custom<PermissionKey>(isPermissionKey)),
});

export const ORDINARY_ACCESS_BLOCKERS = {
  no_active_branch: "Create or restore an active branch.",
  legacy_memberships: "Complete the approved transition for existing legacy staff access.",
  legacy_invitations: "Resolve legacy staff invitations through the approved access transition.",
  transition_manifest: "Complete the approved access transition before enabling staff access.",
  property_branch_scope: "Assign every property to a valid branch and resolve branch conflicts.",
  invalid_memberships: "Review existing staff memberships: each needs an active branch and an active role with permissions.",
  invalid_invitations: "Review pending staff invitations: each needs an active branch and an active role with permissions.",
} as const;

const readinessSchema = z.object({
  organization_id: z.string().uuid(),
  authorization_version: versionSchema,
  ordinary_access_enabled: z.boolean(),
  activation_ready: z.boolean(),
  blockers: z.array(z.enum(Object.keys(ORDINARY_ACCESS_BLOCKERS) as [
    keyof typeof ORDINARY_ACCESS_BLOCKERS,
    ...(keyof typeof ORDINARY_ACCESS_BLOCKERS)[],
  ])),
  impact_fingerprint: fingerprintSchema,
  active_branch_count: countSchema,
  property_count: countSchema,
  unscoped_property_count: countSchema,
  conflicting_record_count: countSchema,
  ordinary_member_count: countSchema,
  live_ordinary_invitation_count: countSchema,
  impact_memberships: z.array(assignmentSchema.extend({
    membership_id: z.string().uuid(),
    user_id: z.string().uuid(),
  })),
  impact_invitations: z.array(assignmentSchema.extend({
    invitation_id: z.string().uuid(),
    email: z.string().min(1),
    status: z.enum(["pending", "send_failed"]),
  })),
});

export type OrdinaryAccessReadiness = z.infer<typeof readinessSchema>;
export type OrdinaryAccessReadResult =
  | { kind: "ready"; readiness: OrdinaryAccessReadiness }
  | { kind: "unavailable"; message: string };

export const ordinaryAccessActivationRequestSchema = z.object({
  confirm: z.literal(true),
  expectedVersion: versionSchema,
  expectedImpactFingerprint: fingerprintSchema,
}).strict();

export type OrdinaryAccessActivationRequest = z.infer<
  typeof ordinaryAccessActivationRequestSchema
>;
export type OrdinaryAccessActivationResult =
  | {
      kind: "activated" | "already_enabled";
      readiness: OrdinaryAccessReadiness;
    }
  | { kind: "stale" | "error"; message: string };

export function parseOrdinaryAccessReadiness(
  value: unknown,
  organizationId: string,
): OrdinaryAccessReadiness | null {
  const parsed = readinessSchema.safeParse(value);
  if (!parsed.success || parsed.data.organization_id !== organizationId) return null;
  const result = parsed.data;
  const assignments = [...result.impact_memberships, ...result.impact_invitations];
  if (
    result.ordinary_member_count !== result.impact_memberships.length ||
    result.live_ordinary_invitation_count !== result.impact_invitations.length ||
    new Set(result.impact_memberships.map((member) => member.membership_id)).size !== result.impact_memberships.length ||
    new Set(result.impact_invitations.map((invitation) => invitation.invitation_id)).size !== result.impact_invitations.length ||
    assignments.some((assignment) => new Set(assignment.permission_keys).size !== assignment.permission_keys.length)
  ) return null;
  if (
    result.activation_ready &&
    (result.ordinary_access_enabled ||
      result.blockers.length > 0 ||
      result.active_branch_count === 0 ||
      result.unscoped_property_count > 0 ||
      result.conflicting_record_count > 0 ||
      assignments.some((assignment) =>
        !assignment.branch_id || !assignment.branch_name ||
        !assignment.role_id || !assignment.role_name ||
        assignment.permission_keys.length === 0
      ))
  ) return null;
  if (
    result.unscoped_property_count + result.conflicting_record_count > result.property_count
  ) return null;
  return result;
}

export function parseOrdinaryAccessActivationReceipt(
  value: unknown,
  organizationId: string,
): Extract<OrdinaryAccessActivationResult, { readiness: OrdinaryAccessReadiness }> | null {
  const status = z.object({
    status: z.enum(["activated", "already_enabled"]),
  }).safeParse(value);
  const readiness = parseOrdinaryAccessReadiness(value, organizationId);
  if (!status.success || !readiness?.ordinary_access_enabled) return null;
  return { kind: status.data.status, readiness };
}
