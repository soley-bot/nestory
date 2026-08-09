import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, revalidatePath, requireSuperAdminContext, rpc } =
  vi.hoisted(() => ({
    createSupabaseServerClient: vi.fn(),
    revalidatePath: vi.fn(),
    requireSuperAdminContext: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth/callback-url", () => ({ getAuthCallbackUrl: vi.fn() }));

import { updateOrganizationAppearanceAction } from "@/features/organization/actions";

beforeEach(() => {
  rpc.mockReset();
  revalidatePath.mockReset();
  requireSuperAdminContext.mockResolvedValue({ organizationId: "org-1" });
  createSupabaseServerClient.mockResolvedValue({ rpc });
});

describe("updateOrganizationAppearanceAction", () => {
  it("normalizes and persists a custom organization accent", async () => {
    rpc.mockResolvedValue({ data: "org-1", error: null });
    const form = new FormData();
    form.set("mode", "dark");
    form.set("accentPreset", "custom");
    form.set("accentSeed", "#2563eb");

    await expect(updateOrganizationAppearanceAction({}, form)).resolves.toEqual({
      message: "Appearance updated.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("update_organization_appearance", {
      p_accent_preset: "custom",
      p_accent_seed: "#2563EB",
      p_organization_id: "org-1",
      p_theme_mode: "dark",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects invalid custom colors before the RPC", async () => {
    const form = new FormData();
    form.set("mode", "dark");
    form.set("accentPreset", "custom");
    form.set("accentSeed", "purple");

    await expect(updateOrganizationAppearanceAction({}, form)).resolves.toEqual({
      message: "Enter a valid six-digit hex color.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("removes custom seed when restoring Neutral", async () => {
    rpc.mockResolvedValue({ data: "org-1", error: null });
    const form = new FormData();
    form.set("mode", "system");
    form.set("accentPreset", "neutral");
    form.set("accentSeed", "#2563EB");

    await updateOrganizationAppearanceAction({}, form);

    expect(rpc).toHaveBeenCalledWith(
      "update_organization_appearance",
      expect.objectContaining({ p_accent_seed: null }),
    );
  });
});
