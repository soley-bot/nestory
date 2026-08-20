import { sha256Hex } from "@/features/documents/content-fingerprint";
import type { WorkspaceRole } from "@/lib/auth/context";

export async function buildScopedSentryIdentity({
  organizationId,
  role,
  userId,
}: {
  organizationId: string;
  role: WorkspaceRole;
  userId: string;
}) {
  const [scopedOrganizationId, scopedUserId] = await Promise.all([
    scopedTelemetryId("organization", organizationId),
    scopedTelemetryId("user", `${organizationId}:${userId}`),
  ]);

  return { role, scopedOrganizationId, scopedUserId };
}

async function scopedTelemetryId(scope: "organization" | "user", value: string) {
  return sha256Hex(new TextEncoder().encode(`nestory:sentry:${scope}:${value}`));
}
