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

import {
  updateOrganizationAppearanceAction,
  updateOrganizationIdentityAction,
} from "@/features/organization/actions";

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

describe("updateOrganizationIdentityAction", () => {
  it("trims and persists the workspace display name without accepting a slug", async () => {
    rpc.mockResolvedValue({ data: "Soley Property Management", error: null });
    const form = new FormData();
    form.set("name", "  Soley Property Management  ");
    form.set("slug", "changed-behind-the-ui");

    await expect(updateOrganizationIdentityAction({}, form)).resolves.toEqual({
      message: "Workspace name updated.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("update_organization_identity", {
      p_name: "Soley Property Management",
      p_organization_id: "org-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/organization");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects an invalid workspace name before the RPC", async () => {
    const form = new FormData();
    form.set("name", " ");

    await expect(updateOrganizationIdentityAction({}, form)).resolves.toEqual({
      message: "Enter a workspace name between 2 and 120 characters.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
