import { expect, it, vi } from "vitest";
const access = vi.hoisted(() => ({ user: vi.fn(), membership: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getCurrentUser: access.user, getWorkspaceMembershipForUser: access.membership }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: access.client }));
import { listDormantDepositRent, previewDormantDepositRent, confirmDormantDepositRent } from "./shared-journal-product-actions";
it("keeps every product action disabled before session/source/journal access", async () => {
  const leaseId = "00000000-0000-4000-8000-000000000003";
  expect((await listDormantDepositRent(leaseId)).status).toBe("error");
  expect((await previewDormantDepositRent({ operation: "reverse", leaseId, applicationId: leaseId, date: "2026-10-04", reason: "Original reversal" })).status).toBe("error");
  expect((await confirmDormantDepositRent({ leaseId, token: leaseId, idempotencyKey: leaseId })).status).toBe("error");
  expect(access.user).not.toHaveBeenCalled(); expect(access.membership).not.toHaveBeenCalled(); expect(access.client).not.toHaveBeenCalled();
});
