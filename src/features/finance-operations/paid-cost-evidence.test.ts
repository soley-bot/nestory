import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  from: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    storage: { from: mocks.from },
  }),
}));

import { preparePaidCostEvidence } from "@/features/finance-operations/paid-cost-evidence";
import {
  invalidPdfFile,
  validPdfBytes,
  validPdfFile,
} from "@/test-utils/upload-content";

const actorId = "00000000-0000-4000-8000-000000000007";
const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000003";
const documentId = "00000000-0000-4000-8000-000000000008";
const objectId = "00000000-0000-4000-8000-000000000009";
const taskId = "00000000-0000-4000-8000-000000000010";
const retainedHash =
  "50dc246b4ff9509811a23d9fcf7d6c8465ed2b4eed08aa049d9feae8e8afd526";

describe("verified paid-cost evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
      download: mocks.download,
      remove: mocks.remove,
      upload: mocks.upload,
    });
    mocks.upload.mockResolvedValue({ data: {}, error: null });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.download.mockResolvedValue({
      data: new Blob([validPdfBytes()], { type: "application/pdf" }),
      error: null,
    });
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      data:
        name === "get_paid_cost_evidence_object"
          ? {
              content_type: "application/pdf",
              metadata_size_bytes: validPdfBytes().byteLength,
              storage_object_id: objectId,
              storage_object_version: "paid-cost-object-v1",
            }
          : {
              content_sha256: retainedHash,
              document_id: documentId,
              size_bytes: validPdfBytes().byteLength,
              status: "registered",
              storage_path: args.p_storage_path,
            },
      error: null,
    }));
  });

  it("returns the exact retained document identity", async () => {
    await expect(preparePaidCostEvidence(input())).resolves.toMatchObject({
      contentSha256: retainedHash,
      documentId,
      storagePath: expect.stringMatching(
        new RegExp(`^${organizationId}/paid-cost-evidence/[0-9a-f]{64}$`),
      ),
    });
  });

  it("uses task-bound object verification before registering maintenance evidence", async () => {
    await preparePaidCostEvidence({ ...input(), taskId });

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "get_paid_cost_evidence_object",
      expect.objectContaining({ p_task_id: taskId }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "register_paid_cost_evidence_verified",
      expect.objectContaining({ p_task_id: taskId }),
    );
  });

  it("rejects a registrar response whose frozen hash differs from retained bytes", async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      data:
        name === "get_paid_cost_evidence_object"
          ? {
              content_type: "application/pdf",
              metadata_size_bytes: validPdfBytes().byteLength,
              storage_object_id: objectId,
              storage_object_version: "paid-cost-object-v1",
            }
          : {
              content_sha256: "0".repeat(64),
              document_id: documentId,
              size_bytes: validPdfBytes().byteLength,
              status: "registered",
              storage_path: args.p_storage_path,
            },
      error: null,
    }));

    await expect(preparePaidCostEvidence(input())).rejects.toThrow(
      "Receipt evidence registration does not match retained bytes.",
    );
  });

  it("removes a newly uploaded object when registration fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_paid_cost_evidence_object") {
        return {
          data: {
            content_type: "application/pdf",
            metadata_size_bytes: validPdfBytes().byteLength,
            storage_object_id: objectId,
            storage_object_version: "paid-cost-object-v1",
          },
          error: null,
        };
      }

      if (name === "register_paid_cost_evidence_verified") {
        return { data: null, error: { message: "registration rejected" } };
      }

      if (name === "begin_paid_cost_evidence_cleanup") {
        return { data: true, error: null };
      }

      return { data: null, error: null };
    });

    await expect(preparePaidCostEvidence(input())).rejects.toThrow(
      "registration rejected",
    );

    expect(mocks.remove).toHaveBeenCalledWith([
      expect.stringMatching(
        new RegExp(`^${organizationId}/paid-cost-evidence/[0-9a-f]{64}$`),
      ),
    ]);
  });

  it("never removes an existing object during an idempotent replay", async () => {
    mocks.upload.mockResolvedValue({
      data: null,
      error: { message: "The resource already exists", statusCode: "409" },
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_paid_cost_evidence_object") {
        return {
          data: {
            content_type: "application/pdf",
            metadata_size_bytes: validPdfBytes().byteLength,
            storage_object_id: objectId,
            storage_object_version: "paid-cost-object-v1",
          },
          error: null,
        };
      }

      return { data: null, error: { message: "registration unavailable" } };
    });

    await expect(preparePaidCostEvidence(input())).rejects.toThrow(
      "registration unavailable",
    );

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "begin_paid_cost_evidence_cleanup",
      expect.anything(),
    );
  });

  it("keeps a new object when the database refuses the cleanup claim", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_paid_cost_evidence_object") {
        return {
          data: {
            content_type: "application/pdf",
            metadata_size_bytes: validPdfBytes().byteLength,
            storage_object_id: objectId,
            storage_object_version: "paid-cost-object-v1",
          },
          error: null,
        };
      }
      if (name === "register_paid_cost_evidence_verified") {
        return { data: null, error: { message: "ambiguous response" } };
      }
      if (name === "begin_paid_cost_evidence_cleanup") {
        return { data: false, error: null };
      }

      return { data: null, error: null };
    });

    await expect(preparePaidCostEvidence(input())).rejects.toThrow(
      "ambiguous response",
    );

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "finish_paid_cost_evidence_cleanup",
      expect.anything(),
    );
  });

  it("rejects spoofed evidence before creating an upload boundary", async () => {
    await expect(
      preparePaidCostEvidence({
        ...input(),
        file: invalidPdfFile("receipt-42.pdf"),
      }),
    ).rejects.toThrow("Receipt evidence content does not match its file type.");

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

function input() {
  return {
    actorId,
    file: validPdfFile("receipt-42.pdf"),
    idempotencyKey: "paid-cost-submit-0001",
    organizationId,
    propertyId,
  };
}
