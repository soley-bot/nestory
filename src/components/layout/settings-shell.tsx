"use client";

import type { ReactNode } from "react";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNavigationGuardProvider } from "@/components/layout/settings-navigation-guard";
import { SettingsSectionNav } from "@/components/layout/settings-section-nav";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { getSettingsDestinations } from "@/features/organization/settings-navigation";
import type { WorkspaceRole, WorkspaceRoleKind } from "@/lib/auth/capabilities";

export function SettingsShell({
  activeHref,
  children,
  role,
}: {
  activeHref: string;
  children: ReactNode;
  role: WorkspaceRole | WorkspaceRoleKind;
}) {
  const currentSection =
    getSettingsDestinations(role).find((destination) => destination.href === activeHref)
      ?.label ?? formatSettingsSection(activeHref);

  return (
    <SettingsNavigationGuardProvider>
      <WorkspacePage
        header={
          <PageHeader
            breadcrumb={
              <PageBreadcrumb
                current={currentSection}
                items={[{ href: "/settings/organization", label: "Settings" }]}
              />
            }
            title="Settings"
          />
        }
      >
        <div className="workspace-gutter-x min-w-0 py-4 lg:py-6">
          <div
            className="grid min-w-0 gap-4 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-6"
          >
            <aside className="min-w-0" aria-label="Settings section list">
              <SettingsSectionNav activeHref={activeHref} role={role} />
            </aside>
            <main className="min-w-0" data-slot="settings-content">
              {children}
            </main>
          </div>
        </div>
      </WorkspacePage>
    </SettingsNavigationGuardProvider>
  );
}

function formatSettingsSection(activeHref: string) {
  const section = activeHref.split("/").filter(Boolean).at(-1) ?? "Settings";

  return section
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
