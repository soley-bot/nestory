import { describe, expect, it, vi } from "vitest";
import { PILOT_RESET_ORGANIZATION } from "@/features/reset-maintenance/review";

const { workspace, notFound } = vi.hoisted(() => ({ workspace: vi.fn(), notFound: vi.fn(() => { throw Error("not found"); }) }));
vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext: workspace }));
vi.mock("next/navigation", () => ({ notFound }));
import { canManagePilotRentPosting, requirePilotRentPostingContext } from "./pilot-rent-posting-context";

const allowed = {
  organizationId: PILOT_RESET_ORGANIZATION, role: "super_admin", roleKind: "super_admin",
  isSuperAdmin: true, branchId: undefined, personId: undefined,
} as Parameters<typeof canManagePilotRentPosting>[0];

describe("Pilot rent posting authority", () => {
  it("allows the actual unscoped Pilot Super Admin without reset maker, host or project requirements", async () => {
    workspace.mockResolvedValue(allowed);
    expect(canManagePilotRentPosting(allowed)).toBe(true);
    await expect(requirePilotRentPostingContext()).resolves.toBe(allowed);
  });
  it.each([
    { organizationId: "10000000-0000-4000-8000-000000000001" },
    { role: "admin" }, { roleKind: "custom" }, { isSuperAdmin: false },
    { branchId: "branch" }, { personId: "person" },
  ])("rejects a non-Pilot or scoped identity: %o", async patch => {
    const context = { ...allowed, ...patch } as Parameters<typeof canManagePilotRentPosting>[0];
    workspace.mockResolvedValue(context);
    expect(canManagePilotRentPosting(context)).toBe(false);
    await expect(requirePilotRentPostingContext()).rejects.toThrow("not found");
  });
});
