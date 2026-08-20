"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { sha256Hex } from "@/features/documents/content-fingerprint";
import type { WorkspaceRole } from "@/lib/auth/context";

async function scopedTelemetryId(scope: "organization" | "user", value: string) {
  return sha256Hex(new TextEncoder().encode(`nestory:sentry:${scope}:${value}`));
}

export function SentryIdentity({
  organizationId,
  role,
  userId,
}: {
  organizationId: string;
  role: WorkspaceRole;
  userId: string;
}) {
  useEffect(() => {
    let active = true;

    void Promise.all([
      scopedTelemetryId("organization", organizationId),
      scopedTelemetryId("user", `${organizationId}:${userId}`),
    ]).then(([scopedOrganizationId, scopedUserId]) => {
      if (!active) return;
      Sentry.setUser({ id: scopedUserId });
      Sentry.setTags({ organization_id: scopedOrganizationId, role });
    }).catch(() => {
      if (!active) return;
      Sentry.setUser(null);
      Sentry.setTag("organization_id", undefined);
      Sentry.setTag("role", undefined);
    });

    return () => {
      active = false;
      Sentry.setUser(null);
      Sentry.setTag("organization_id", undefined);
      Sentry.setTag("role", undefined);
    };
  }, [organizationId, role, userId]);

  return null;
}
