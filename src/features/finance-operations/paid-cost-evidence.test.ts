import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  from: vi.fn(),
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

const actorId = "00000000-0000-4000-8000-000000000007";
const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000003";
const documentId = "00000000-0000-4000-8000-000000000008";
const objectId = "00000000-0000-4000-8000-000000000009";
const retainedHash =
  "ce67cf246af90faa45cd4b6cde1627da5683d1dbfa53ed5f7ca8a2805543be0d";

describe("verified paid-cost evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
      download: mocks.download,
      upload: mocks.upload,
    });
    mocks.upload.mockResolvedValue({ data: {}, error: null });
    mocks.download.mockResolvedValue({
      data: new Blob(["paid-cost-receipt"], { type: "application/pdf" }),
      error: null,
    });
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      data:
        name === "get_paid_cost_evidence_object"
          ? {
              content_type: "application/pdf",
              metadata_size_bytes: 17,
              storage_object_id: objectId,
              storage_object_version: "paid-cost-object-v1",
            }
          : {
              content_sha256: retainedHash,
              document_id: documentId,
              size_bytes: 17,
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

  it("rejects a registrar response whose frozen hash differs from retained bytes", async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      data:
        name === "get_paid_cost_evidence_object"
          ? {
              content_type: "application/pdf",
              metadata_size_bytes: 17,
              storage_object_id: objectId,
              storage_object_version: "paid-cost-object-v1",
            }
          : {
              content_sha256: "0".repeat(64),
              document_id: documentId,
              size_bytes: 17,
              status: "registered",
              storage_path: args.p_storage_path,
            },
      error: null,
    }));

    await expect(preparePaidCostEvidence(input())).rejects.toThrow(
      "Receipt evidence registration does not match retained bytes.",
    );
  });
});

function input() {
  return {
    actorId,
    file: new File(["paid-cost-receipt"], "receipt-42.pdf", {
      type: "application/pdf",
    }),
    idempotencyKey: "paid-cost-submit-0001",
    organizationId,
    propertyId,
  };
}
