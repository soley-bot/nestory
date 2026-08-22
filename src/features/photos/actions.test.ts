import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  remove: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  })),
}));

import {
  archiveAssetPhotoAction,
  createAssetPhotoAction,
} from "@/features/photos/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const photoId = "20000000-0000-4000-8000-000000000001";
const generatedId = "30000000-0000-4000-8000-000000000001";

describe("photo action authority and storage scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ branchId, organizationId });
    const query = {
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { branch_id: branchId, id: propertyId },
        error: null,
      })),
      select: vi.fn(() => query),
    };
    mocks.from.mockReturnValue(query);
    mocks.storageFrom.mockReturnValue({
      remove: mocks.remove,
      upload: mocks.upload,
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: photoId, error: null });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(generatedId);
  });

  it("derives the canonical branch path from the RLS-visible Property", async () => {
    const formData = new FormData();
    formData.set("caption", "Lobby");
    formData.set("propertyId", propertyId);
    formData.set("takenAt", "");
    formData.set("unitId", "");
    formData.set("photo", new File(["image"], "lobby.jpg", { type: "image/jpeg" }));

    await expect(createAssetPhotoAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("properties.write");
    expect(mocks.upload).toHaveBeenCalledWith(
      `${organizationId}/branches/${branchId}/photos/properties/${propertyId}/${generatedId}-lobby.jpg`,
      expect.any(File),
      expect.any(Object),
    );
  });

  it("uses properties.archive for photo archival", async () => {
    const formData = new FormData();
    formData.set("photoId", generatedId);

    await archiveAssetPhotoAction(formData);

    expect(mocks.requirePermission).toHaveBeenCalledWith("properties.archive");
  });
});
