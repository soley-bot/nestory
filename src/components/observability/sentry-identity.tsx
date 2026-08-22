"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import type { WorkspaceRole, WorkspaceRoleKind } from "@/lib/auth/context";
import { buildScopedSentryIdentity } from "@/lib/observability/sentry-identity";

export function SentryIdentity({
  organizationId,
  role,
  userId,
}: {
  organizationId: string;
  role: WorkspaceRole | WorkspaceRoleKind;
  userId: string;
}) {
  useEffect(() => {
    let active = true;

    void buildScopedSentryIdentity({ organizationId, role, userId })
      .then((identity) => {
        if (!active) return;
        Sentry.setUser({ id: identity.scopedUserId });
        Sentry.setTags({
          organization_id: identity.scopedOrganizationId,
          role: identity.role,
        });
      })
      .catch(() => {
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
