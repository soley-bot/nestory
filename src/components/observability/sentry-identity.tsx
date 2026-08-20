"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import type { WorkspaceRole } from "@/lib/auth/context";

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
    Sentry.setUser({ id: userId });
    Sentry.setTags({ organization_id: organizationId, role });

    return () => {
      Sentry.setUser(null);
      Sentry.setTag("organization_id", undefined);
      Sentry.setTag("role", undefined);
    };
  }, [organizationId, role, userId]);

  return null;
}
