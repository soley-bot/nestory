import { renderToStaticMarkup } from "react-dom/server";
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
      expect(html.includes("Workspace Access")).toBe(role === "super_admin");
    },
  );
});
