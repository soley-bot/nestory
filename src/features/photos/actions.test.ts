import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  registrationSingle: vi.fn(),
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
import {
  invalidJpegFile,
  validJpegFile,
} from "@/test-utils/upload-content";

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
    const registrationQuery = {
      eq: vi.fn(() => registrationQuery),
      maybeSingle: mocks.registrationSingle,
      select: vi.fn(() => registrationQuery),
    };
    mocks.from.mockImplementation((table) =>
      table === "asset_photos" ? registrationQuery : query,
    );
    mocks.registrationSingle.mockReset();
    mocks.registrationSingle.mockResolvedValue({ data: null, error: null });
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
    formData.set("photo", validJpegFile("lobby.jpg"));

    await expect(createAssetPhotoAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("properties.write");
    expect(mocks.upload).toHaveBeenCalledWith(
      `${organizationId}/branches/${branchId}/photos/properties/${propertyId}/${generatedId}-lobby.jpg`,
      expect.any(Uint8Array),
      expect.any(Object),
    );
  });

  it("rejects non-image bytes labelled as a JPEG before Storage", async () => {
    const formData = new FormData();
    formData.set("caption", "Lobby");
    formData.set("propertyId", propertyId);
    formData.set("takenAt", "");
    formData.set("unitId", "");
    formData.set("photo", invalidJpegFile("lobby.jpg"));

    await expect(createAssetPhotoAction({}, formData)).resolves.toEqual({
      fieldErrors: { photo: ["Upload a JPG, PNG, or WebP photo."] },
      message: "Upload a JPG, PNG, or WebP photo.",
      status: "error",
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uses properties.archive for photo archival", async () => {
    const formData = new FormData();
    formData.set("photoId", generatedId);

    await archiveAssetPhotoAction(formData);

    expect(mocks.requirePermission).toHaveBeenCalledWith("properties.archive");
  });

  it.each(["returned error", "thrown response loss", "missing response id"])(
    "recovers committed registration after %s without removing its bytes",
    async (response) => {
      if (response === "thrown response loss") {
        mocks.rpc.mockRejectedValueOnce(new Error("connection lost"));
      } else {
        mocks.rpc.mockResolvedValueOnce({
          data: null,
          error: response === "returned error" ? { message: "connection lost" } : null,
        });
      }
      mocks.registrationSingle.mockResolvedValueOnce({ data: { id: photoId }, error: null });

      await expect(createAssetPhotoAction({}, photoForm())).resolves.toEqual({
        message: "Photo uploaded.",
        status: "success",
      });
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/properties/${propertyId}`);
    },
  );

  it("cleans up a definitely rejected registration using authenticated Storage", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Unit not found" } });

    await expect(createAssetPhotoAction({}, photoForm())).resolves.toEqual({
      message: "Choose an active unit before uploading a photo.",
      status: "error",
    });
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
    const query = mocks.from.mock.results.find((_, index) => mocks.from.mock.calls[index][0] === "asset_photos")?.value;
    expect(query.eq).toHaveBeenCalledWith("organization_id", organizationId);
    expect(query.eq).toHaveBeenCalledWith("storage_path", mocks.upload.mock.calls[0][0]);
  });

  it.each(["error", "throw"])("retains bytes when reconciliation returns %s", async (failure) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "connection lost" } });
    if (failure === "throw") mocks.registrationSingle.mockRejectedValueOnce(new Error("offline"));
    else mocks.registrationSingle.mockResolvedValueOnce({ data: null, error: { message: "offline" } });

    await expect(createAssetPhotoAction({}, photoForm())).resolves.toMatchObject({ status: "error" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(["error", "throw"])("preserves registration failure when orphan cleanup returns %s", async (failure) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Unit not found" } });
    if (failure === "throw") mocks.remove.mockRejectedValueOnce(new Error("cleanup failed"));
    else mocks.remove.mockResolvedValueOnce({ error: { message: "cleanup denied" } });

    await expect(createAssetPhotoAction({}, photoForm())).resolves.toEqual({
      message: "Choose an active unit before uploading a photo.",
      status: "error",
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith("properties.write");
  });
});

function photoForm() {
  const form = new FormData();
  form.set("caption", "Lobby");
  form.set("propertyId", propertyId);
  form.set("takenAt", "");
  form.set("unitId", "");
  form.set("photo", validJpegFile("lobby.jpg"));
  return form;
}
