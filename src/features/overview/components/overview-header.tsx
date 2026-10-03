"use client";

import { WorkspaceHeaderPortal } from "@/components/layout/workspace-header-portal";
import { PageHelp } from "@/components/help/page-help";

export function OverviewHeader() {
  return (
    <WorkspaceHeaderPortal>
      <OverviewHeaderContent />
    </WorkspaceHeaderPortal>
  );
}

export function OverviewHeaderContent() {
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2"
      data-slot="overview-header-row"
    >
      <h1 className="shrink-0 text-base font-medium">Dashboard</h1>
      <PageHelp />
    </div>
  );
}
