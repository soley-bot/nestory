import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadTenantCommercialDocumentArtifact } from "@/features/finance-operations/documents/commercial-document-artifacts";
import { downloadOwnerStatementArtifact } from "@/features/reports/data/owner-statement-artifacts";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { scopes } from "./fixtures";

vi.mock("@/lib/db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth/privileged-step-up-guard", () => ({ requirePrivilegedStepUp: vi.fn() }));

const cases = scopes.flatMap((scope) => (["commercial", "owner"] as const).flatMap((kind) =>
  (["allowed", "rpc-denied", "metadata-absent", "integrity-denied"] as const).map((outcome) => ({ scope, kind, outcome })),
));

describe("synthetic artifact authorization handoff (32 mock cases)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(cases)("$scope.company/$scope.branch $kind $outcome", async ({ scope, kind, outcome }) => {
    const events: string[] = [];
    const download = vi.fn(async () => {
      events.push("storage");
      return { data: new Blob([outcome === "integrity-denied" ? new Uint8Array([0]) : scope.bytes]), error: null };
    });
    const from = vi.fn(() => ({ download }));
    const rpc = vi.fn(async () => {
      events.push("metadata");
      return {
        data: outcome === "metadata-absent" ? null : kind === "commercial" ? scope.commercialMetadata : scope.ownerMetadata,
        error: outcome === "rpc-denied" ? { message: "Synthetic authority denied" } : null,
      };
    });
    const client = { rpc, storage: { from } };
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ storage: { from } } as never);
    const operation = kind === "commercial"
      ? downloadTenantCommercialDocumentArtifact(client as never, scope.organizationId, scope.artifactId)
      : downloadOwnerStatementArtifact(client, scope.organizationId, scope.artifactId);

    if (outcome === "allowed") {
      expect((await operation).bytes).toEqual(scope.bytes);
      expect(events).toEqual(["metadata", "storage"]);
    } else {
      await expect(operation).rejects.toThrow();
    }
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      kind === "commercial" ? "get_tenant_commercial_document_artifact_download" : "get_owner_statement_artifact_download",
      { p_artifact_id: scope.artifactId, p_organization_id: scope.organizationId },
    );
    if (outcome === "rpc-denied" || outcome === "metadata-absent") {
      expect(from).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
      expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    } else {
      expect(download).toHaveBeenCalledExactlyOnceWith(scope.storagePath);
      expect(from).toHaveBeenCalledWith(kind === "commercial" ? "tenant-commercial-documents" : "owner-statements");
      expect(createSupabaseAdminClient).toHaveBeenCalledTimes(kind === "commercial" ? 1 : 0);
    }
  });
});
