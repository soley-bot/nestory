import { cleanup, render } from "@testing-library/react";
import { vi } from "vitest";

import { SettingsNavigationGuardProvider } from "@/components/layout/settings-navigation-guard";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { SettingsSectionNav } from "@/components/layout/settings-section-nav";
import { SettingsShell } from "@/components/layout/settings-shell";
import {
  SettingsWorkspace,
  type SettingsSection,
} from "@/features/organization/components/settings-workspace";

const branches = [
  {
    address: "12 River Road",
    code: "BKK",
    id: "11111111-1111-4111-8111-111111111111",
    name: "Bangkok",
    status: "active",
  },
];

const staff = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Mina Chen",
  },
];

const teams = [
  {
    branchId: branches[0].id,
    id: "33333333-3333-4333-8333-333333333333",
    managerPersonId: staff[0].id,
    name: "Field Operations",
  },
];

export const defaultSettingsWorkspaceProps = {
  branches,
  canManageStructure: true,
  organizationName: "Nestory Test",
  organizationSlug: "nestory-test",
  staff,
  teams,
  workspaceSetup: {
    operationalTimezone: "UTC",
    preferredCurrency: "USD",
  },
  workspaceUrl: "https://nestory-test.nestory-kh.com/",
} as const;

export function installSettingsWorkspaceDomStubs() {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: {
      configurable: true,
      value: () => false,
    },
    releasePointerCapture: {
      configurable: true,
      value: () => undefined,
    },
    scrollIntoView: {
      configurable: true,
      value: () => undefined,
    },
    setPointerCapture: {
      configurable: true,
      value: () => undefined,
    },
  });
}

export function cleanupSettingsWorkspaceTest() {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
}

export function renderSettingsPage(section: SettingsSection) {
  return render(
    <SettingsNavigationGuardProvider>
      <SettingsTabs activeHref={`/settings/${section}`} />
      <SettingsSectionNav
        activeHref={`/settings/${section}`}
        role="super_admin"
      />
      <SettingsWorkspace
        {...defaultSettingsWorkspaceProps}
        section={section}
      />
    </SettingsNavigationGuardProvider>,
  );
}

export function renderSettingsScreen(
  section: "organization" | "branches" | "teams",
) {
  return render(
    <SettingsShell activeHref={`/settings/${section}`} role="super_admin">
      <SettingsWorkspace
        {...defaultSettingsWorkspaceProps}
        section={section}
      />
    </SettingsShell>,
  );
}
