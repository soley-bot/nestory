import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRentPolicyVersions, requireLeaseConfigurationContext } = vi.hoisted(
  () => ({
    getRentPolicyVersions: vi.fn(),
    requireLeaseConfigurationContext: vi.fn(),
  }),
);

vi.mock("@/lib/auth/context", () => ({ requireLeaseConfigurationContext }));
vi.mock("@/features/leases/data/rent-policy", () => ({ getRentPolicyVersions }));
vi.mock("@/features/leases/components/rent-policy-screen", () => ({
  RentPolicyScreen: () => <div>Rent policy workspace</div>,
}));
vi.mock("@/components/layout/settings-shell", () => ({
  SettingsShell: ({ children, role }: { children: ReactNode; role: string }) => (
    <div>
      <h1>Settings</h1>
      <span>Settings role: {role}</span>
      {children}
    </div>
  ),
}));

import RentPolicyPage from "@/app/(dashboard)/settings/rent-policy/page";

describe("rent policy route", () => {
  beforeEach(() => {
    getRentPolicyVersions.mockReset();
    requireLeaseConfigurationContext.mockReset();
    getRentPolicyVersions.mockResolvedValue([]);
  });

  it.each(["super_admin", "finance_manager"] as const)(
    "uses lease-configuration authority for %s",
    async (role) => {
      requireLeaseConfigurationContext.mockResolvedValue({
        organizationId: "organization-1",
        role,
      });

      const html = renderToStaticMarkup(await RentPolicyPage());

      expect(html).toContain("Rent policy workspace");
      expect(getRentPolicyVersions).toHaveBeenCalledWith("organization-1");
      expect(html).toContain("Settings</h1>");
      expect(html).toContain(`Settings role: ${role}`);
    },
  );
});
