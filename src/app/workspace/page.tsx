import { redirect } from "next/navigation";

import { requireWorkspaceContext } from "@/lib/auth/context";
import { getOrganizationWorkspaceUrl } from "@/lib/auth/tenant";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await requireWorkspaceContext();
  redirect(
    getOrganizationWorkspaceUrl(
      context.organizationSlug,
      getWorkspaceEntryPath(context.permissionContext),
    ),
  );
}
