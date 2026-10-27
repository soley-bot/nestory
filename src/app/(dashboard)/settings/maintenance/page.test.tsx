import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const { context, action, stepUp } = vi.hoisted(() => ({ context: vi.fn(), action: vi.fn(), stepUp: vi.fn() }));
vi.mock("@/features/reset-maintenance/context", () => ({ requirePilotResetContext: context }));
vi.mock("@/features/reset-maintenance/actions", () => ({ submitMaintenanceReviewAction: action }));
vi.mock("@/lib/auth/privileged-step-up-guard", () => ({ requirePrivilegedStepUp: stepUp }));
vi.mock("@/components/layout/settings-shell", () => ({ SettingsShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
import PilotMaintenancePage from "./page";
beforeEach(() => { vi.clearAllMocks(); context.mockResolvedValue({ role: "super_admin" }); });
it("renders a visible review-file form without issuing authority on page render", async () => {
  const html = renderToStaticMarkup(await PilotMaintenancePage());
  expect(html).toContain("Pilot October reset approvals"); expect(html).toContain('type="file"');
  expect(html).toContain("Choose a review file"); expect(html).toContain("disabled");
  expect(action).not.toHaveBeenCalled(); expect(stepUp).not.toHaveBeenCalled();
});
it("denies the page before showing any approval form", async () => {
  context.mockRejectedValue(Error("not found")); await expect(PilotMaintenancePage()).rejects.toThrow("not found"); expect(action).not.toHaveBeenCalled();
});
