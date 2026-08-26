import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  from: vi.fn(),
  maybeSingleByTable: new Map<string, unknown>(),
  maybeSingleByStoragePath: new Map<string, unknown>(),
  remove: vi.fn(),
  requirePermission: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  requireWorkspaceContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requirePermission: mocks.requirePermission,
  requireSuperAdminContext: mocks.requireSuperAdminContext,
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  })),
}));

import {
  archiveDocumentAction,
  createDocumentAction,
  fingerprintDocumentContentAction,
  restoreDocumentAction,
  updateDocumentAction,
} from "@/features/documents/actions";
import {
  invalidPdfFile,
  validPdfBytes,
  validPdfFile,
} from "@/test-utils/upload-content";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const documentId = "20000000-0000-4000-8000-000000000001";
const generatedId = "30000000-0000-4000-8000-000000000001";
const fileHash = "50dc246b4ff9509811a23d9fcf7d6c8465ed2b4eed08aa049d9feae8e8afd526";

function createQuery(table: string) {
  const filters = new Map<string, unknown>();
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.set(column, value);
      return query;
    }),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      const storagePath = filters.get("storage_path");
      if (typeof storagePath === "string") {
        return mocks.maybeSingleByStoragePath.get(storagePath) ?? {
          data: null,
          error: null,
        };
      }
      return mocks.maybeSingleByTable.get(table) ?? { data: null, error: null };
    }),
    select: vi.fn(() => query),
  };

  return query;
}

function documentForm(file?: File) {
  const formData = new FormData();
  formData.set("category", "owner_opening_balance_evidence");
  formData.set("leaseId", "");
  formData.set("propertyId", propertyId);
  formData.set("taskId", "");
  formData.set("unitId", "");
  if (file) formData.set("document", file);
  return formData;
}

function evidenceFile() {
  return validPdfFile("opening.pdf");
}

describe("document fingerprint actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingleByTable.clear();
    mocks.maybeSingleByStoragePath.clear();
    mocks.requireSuperAdminContext.mockResolvedValue({ organizationId });
    mocks.requirePermission.mockResolvedValue({ branchId, organizationId });
    mocks.requireWorkspaceContext.mockResolvedValue({
      branchId,
      isSuperAdmin: false,
      organizationId,
    });
    mocks.maybeSingleByTable.set("properties", {
      data: { branch_id: branchId, id: propertyId },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => createQuery(table));
    mocks.storageFrom.mockReturnValue({
      download: mocks.download,
      remove: mocks.remove,
      upload: mocks.upload,
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.download.mockResolvedValue({
      data: new Blob([validPdfBytes()], {
        type: "application/pdf",
      }),
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: generatedId, error: null });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(generatedId);
  });

  it("hashes exact file bytes before upload and passes the lowercase hash to checked create", async () => {
    await expect(createDocumentAction({}, documentForm(evidenceFile()))).resolves.toEqual({
      contentSha256: fileHash,
      documentId: generatedId,
      fileName: "opening.pdf",
      message: "Document uploaded.",
      status: "success",
    });

    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledWith(
      `${organizationId}/branches/${branchId}/documents/${generatedId}-opening.pdf`,
      expect.any(Uint8Array),
      expect.any(Object),
    );
    expect(mocks.requirePermission).toHaveBeenCalledWith("properties.write");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balances");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_document",
      expect.objectContaining({
        p_content_sha256: fileHash,
        p_file_name: "opening.pdf",
        p_organization_id: organizationId,
        p_property_id: propertyId,
      }),
    );
  });

  it("rejects spoofed document bytes before opening Storage", async () => {
    const result = await createDocumentAction(
      {},
      documentForm(invalidPdfFile("opening.pdf")),
    );

    expect(result).toEqual({
      fieldErrors: {
        document: ["Upload a PDF, JPG, PNG, or WebP document."],
      },
      status: "error",
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("replaces bytes through one atomic metadata create-and-archive RPC", async () => {
    mocks.maybeSingleByTable.set("documents", {
      data: {
        archived_at: null,
        category: "lease",
        content_sha256: "1".repeat(64),
        file_name: "old.pdf",
        lease_id: null,
        mime_type: "application/pdf",
        property_id: propertyId,
        size_bytes: 3,
        storage_path: `${organizationId}/documents/old.pdf`,
        task_id: null,
        unit_id: null,
      },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: generatedId, error: null });
    const formData = documentForm(evidenceFile());
    formData.set("documentId", documentId);

    await expect(updateDocumentAction({}, formData)).resolves.toEqual({
      message: "Replacement uploaded as a new document.",
      status: "success",
    });

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "replace_document",
      expect.objectContaining({
        p_content_sha256: fileHash,
        p_document_id: documentId,
        p_organization_id: organizationId,
      }),
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith("update_document", expect.anything());
    expect(mocks.remove).not.toHaveBeenCalledWith([
      `${organizationId}/documents/old.pdf`,
    ]);
  });

  it("removes only an unregistered unique object when atomic replacement fails", async () => {
    mocks.maybeSingleByTable.set("documents", {
      data: {
        archived_at: null,
        category: "lease",
        content_sha256: "1".repeat(64),
        file_name: "old.pdf",
        lease_id: null,
        mime_type: "application/pdf",
        property_id: propertyId,
        size_bytes: 3,
        storage_path: `${organizationId}/documents/old.pdf`,
        task_id: null,
        unit_id: null,
      },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "referenced" },
    });
    const formData = documentForm(evidenceFile());
    formData.set("documentId", documentId);

    await expect(updateDocumentAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });

    const replacementPath = `${organizationId}/branches/${branchId}/documents/${generatedId}-opening.pdf`;
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "discard_unreferenced_document_upload",
      expect.anything(),
    );
    expect(mocks.remove).toHaveBeenCalledWith([replacementPath]);
    expect(mocks.remove).not.toHaveBeenCalledWith([
      `${organizationId}/documents/old.pdf`,
    ]);
  });

  it("never removes an object after failed create when metadata already owns its path", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "duplicate request" },
    });
    const path = `${organizationId}/branches/${branchId}/documents/${generatedId}-opening.pdf`;
    mocks.maybeSingleByStoragePath.set(path, {
      data: { id: documentId },
      error: null,
    });

    await expect(
      createDocumentAction({}, documentForm(evidenceFile())),
    ).resolves.toMatchObject({ status: "error" });

    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("updates metadata without sending any byte identity fields", async () => {
    mocks.maybeSingleByTable.set("documents", {
      data: {
        archived_at: null,
        category: "lease",
        content_sha256: "1".repeat(64),
        file_name: "old.pdf",
        lease_id: null,
        mime_type: "application/pdf",
        property_id: propertyId,
        size_bytes: 3,
        storage_path: `${organizationId}/documents/old.pdf`,
        task_id: null,
        unit_id: null,
      },
      error: null,
    });
    const formData = documentForm();
    formData.set("documentId", documentId);

    await expect(updateDocumentAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("update_document", {
      p_category: "owner_opening_balance_evidence",
      p_document_id: documentId,
      p_lease_id: undefined,
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_task_id: undefined,
      p_unit_id: undefined,
    });
  });

  it("fingerprints a legacy document from bytes actually downloaded and read", async () => {
    mocks.maybeSingleByTable.set("documents", {
      data: {
        archived_at: null,
        category: "lease",
        content_sha256: null,
        file_name: "legacy.pdf",
        lease_id: null,
        mime_type: "application/pdf",
        property_id: propertyId,
        size_bytes: 25,
        storage_path: `${organizationId}/documents/legacy.pdf`,
        task_id: null,
        unit_id: null,
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("documentId", documentId);

    await expect(fingerprintDocumentContentAction({}, formData)).resolves.toEqual({
      message: "Document fingerprint recorded.",
      status: "success",
    });

    expect(mocks.download).toHaveBeenCalledWith(
      `${organizationId}/documents/legacy.pdf`,
    );
    expect(mocks.rpc).toHaveBeenCalledWith("fingerprint_document_content", {
      p_content_sha256: fileHash,
      p_document_id: documentId,
      p_organization_id: organizationId,
    });
    expect(mocks.requireSuperAdminContext).toHaveBeenCalledOnce();
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("uses archive authority for both archive-state transitions", async () => {
    const formData = new FormData();
    formData.set("documentId", documentId);
    mocks.maybeSingleByTable.set("documents", {
      data: {
        archived_at: null,
        category: "property",
        content_sha256: "1".repeat(64),
        file_name: "record.pdf",
        lease_id: null,
        ledger_entry_id: null,
        mime_type: "application/pdf",
        property_id: propertyId,
        size_bytes: 3,
        storage_path: `${organizationId}/branches/${branchId}/documents/record.pdf`,
        task_id: null,
        tenant_request_id: null,
        timeline_event_id: null,
        unit_id: null,
      },
      error: null,
    });

    await archiveDocumentAction({}, formData);
    await restoreDocumentAction({}, formData);

    expect(mocks.requirePermission).toHaveBeenCalledTimes(2);
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(
      1,
      "properties.archive",
    );
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(
      2,
      "properties.archive",
    );
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });

  it("requires both old and proposed parent-domain authority for a relink", async () => {
    const taskId = "40000000-0000-4000-8000-000000000001";
    mocks.maybeSingleByTable.set("documents", {
      data: {
        archived_at: null,
        category: "lease",
        content_sha256: "1".repeat(64),
        file_name: "lease.pdf",
        lease_id: "50000000-0000-4000-8000-000000000001",
        ledger_entry_id: null,
        mime_type: "application/pdf",
        property_id: propertyId,
        size_bytes: 3,
        storage_path: `${organizationId}/branches/${branchId}/documents/lease.pdf`,
        task_id: null,
        tenant_request_id: null,
        timeline_event_id: null,
        unit_id: null,
      },
      error: null,
    });
    mocks.maybeSingleByTable.set("tasks", {
      data: { id: taskId, property_id: propertyId, unit_id: null },
      error: null,
    });
    const formData = documentForm();
    formData.set("documentId", documentId);
    formData.set("taskId", taskId);

    await updateDocumentAction({}, formData);

    expect(mocks.requirePermission).toHaveBeenNthCalledWith(
      1,
      "leases.change_terms",
    );
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(
      2,
      "maintenance.create_assign",
    );
  });
});
