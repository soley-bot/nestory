import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { downloadOwnerStatementArtifact } from "@/features/reports/data/owner-statement-artifacts";

const organizationId = "00000000-0000-0000-0000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";
const bytes = new Uint8Array([37, 80, 68, 70]);
const hash = createHash("sha256").update(bytes).digest("hex");

describe("official Owner Statement artifact download", () => {
  it("returns only retained bytes after verifying immutable size and hash", async () => {
    const download = vi.fn(async () => ({
      data: new Blob([bytes], { type: "application/pdf" }),
      error: null,
    }));
    const client = {
      rpc: vi.fn(async () => ({
        data: {
          artifact_id: artifactId,
          format: "pdf",
          sha256: hash,
          size_bytes: 4,
          statement_number: "OS-202608-000000000000",
          storage_path:
            `${organizationId}/00000000-0000-4000-8000-000000000003/pdf/` +
            "owner-statement-OS-202608-000000000000.pdf",
        },
        error: null,
      })),
      storage: { from: vi.fn(() => ({ download })) },
    };

    const result = await downloadOwnerStatementArtifact(client, organizationId, artifactId);

    expect(result.bytes).toEqual(bytes);
    expect(result.filename).toBe("owner-statement-OS-202608-000000000000.pdf");
    expect(client.storage.from).toHaveBeenCalledWith("owner-statements");
  });

  it("refuses storage bytes that do not match immutable metadata", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: {
          artifact_id: artifactId,
          format: "pdf",
          sha256: "a".repeat(64),
          size_bytes: 4,
          statement_number: "OS-202608-000000000000",
          storage_path: `${organizationId}/bad.pdf`,
        },
        error: null,
      })),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({ data: new Blob([bytes]), error: null })),
        })),
      },
    };

    await expect(
      downloadOwnerStatementArtifact(client, organizationId, artifactId),
    ).rejects.toThrow("integrity");
  });
});
