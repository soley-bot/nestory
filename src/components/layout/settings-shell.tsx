"use client";

import type { ReactNode } from "react";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNavigationGuardProvider } from "@/components/layout/settings-navigation-guard";
import { SettingsSectionNav } from "@/components/layout/settings-section-nav";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { getSettingsDestinations } from "@/features/organization/settings-navigation";
import type { WorkspaceRole } from "@/lib/auth/capabilities";

export function SettingsShell({
  activeHref,
  children,
  role,
}: {
  activeHref: string;
  children: ReactNode;
  role: WorkspaceRole;
}) {
  const accessView = activeHref === "/settings/access";
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
            description="Workspace identity, structure, access, and operating rules."
            navigation={<SettingsTabs activeHref={activeHref} role={role} />}
            title="Settings"
          />
        }
      >
        <div className="workspace-gutter-x min-w-0 py-4 lg:py-6">
          <div
            className={
              accessView
                ? "min-w-0"
                : "grid min-w-0 gap-5 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8"
            }
          >
            {!accessView ? (
              <aside className="min-w-0" aria-label="Settings section list">
                <p className="mb-2 hidden px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">
                  Workspace
                </p>
                <SettingsSectionNav activeHref={activeHref} role={role} />
              </aside>
            ) : null}
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
