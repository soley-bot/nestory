import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSignedUrl,
  createSupabaseServerClient,
  logoSingle,
  remove,
  revalidatePath,
  requireSuperAdminContext,
  rpc,
  upload,
} =
  vi.hoisted(() => ({
    createSignedUrl: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    logoSingle: vi.fn(),
    remove: vi.fn(),
    revalidatePath: vi.fn(),
    requireSuperAdminContext: vi.fn(),
    rpc: vi.fn(),
    upload: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth/callback-url", () => ({ getAuthCallbackUrl: vi.fn() }));

import {
  removeOrganizationLogoAction,
  updateOrganizationAppearanceAction,
  updateOrganizationIdentityAction,
  uploadOrganizationLogoAction,
} from "@/features/organization/actions";
import { validPngBytes } from "@/test-utils/upload-content";

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  rpc.mockReset();
  upload.mockReset();
  remove.mockReset();
  logoSingle.mockReset();
  createSignedUrl.mockReset();
  revalidatePath.mockReset();
  requireSuperAdminContext.mockResolvedValue({ organizationId: "org-1" });
  logoSingle.mockResolvedValue({ data: { logo_storage_path: null }, error: null });
  upload.mockResolvedValue({ data: {}, error: null });
  remove.mockResolvedValue({ data: {}, error: null });
  createSupabaseServerClient.mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: logoSingle })),
      })),
    })),
    rpc,
    storage: {
      from: vi.fn(() => ({ createSignedUrl, remove, upload })),
    },
  });
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

describe("organization logo actions", () => {
  it("uploads a versioned logo, selects it, then removes the previous object", async () => {
    const previousPath = "org-1/logos/00000000-0000-4000-8000-000000000001.png";
    logoSingle.mockResolvedValue({ data: { logo_storage_path: previousPath }, error: null });
    rpc.mockResolvedValue({ data: "selected", error: null });
    const form = new FormData();
    form.set("logo", validPngFile());

    await expect(uploadOrganizationLogoAction({}, form)).resolves.toEqual({
      message: "Company logo updated.",
      status: "success",
    });

    const uploadedPath = upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^org-1\/logos\/[0-9a-f-]{36}\.png$/);
    expect(upload).toHaveBeenCalledWith(uploadedPath, expect.any(Uint8Array), {
      cacheControl: "31536000",
      contentType: "image/png",
      upsert: false,
    });
    expect(rpc).toHaveBeenCalledWith("update_organization_logo", {
      p_logo_storage_path: uploadedPath,
      p_organization_id: "org-1",
    });
    expect(remove).toHaveBeenCalledWith([previousPath]);
  });

  it("removes the new object when selecting it fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "pointer failed" } });
    const form = new FormData();
    form.set("logo", validPngFile());

    await expect(uploadOrganizationLogoAction({}, form)).resolves.toEqual({
      message: "We could not save the company logo.",
      status: "error",
    });

    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it("rejects invalid image content before opening Storage", async () => {
    const form = new FormData();
    form.set("logo", new File([new Uint8Array([1, 2, 3])], "fake.png", { type: "image/png" }));

    await expect(uploadOrganizationLogoAction({}, form)).resolves.toEqual({
      message: "The file content does not match its image type.",
      status: "error",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("clears the pointer before deleting the old logo", async () => {
    const previousPath = "org-1/logos/00000000-0000-4000-8000-000000000001.png";
    logoSingle.mockResolvedValue({ data: { logo_storage_path: previousPath }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(removeOrganizationLogoAction({}, new FormData())).resolves.toEqual({
      message: "Company logo removed.",
      status: "success",
    });

    expect(rpc).toHaveBeenCalledWith("update_organization_logo", {
      p_logo_storage_path: "",
      p_organization_id: "org-1",
    });
    expect(remove).toHaveBeenCalledWith([previousPath]);
  });
});

function validPngFile() {
  return new File([validPngBytes(512, 256)], "company.png", {
    type: "image/png",
  });
}
