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
  const input = new TextEncoder().encode(`nestory:sentry:${scope}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", input);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
