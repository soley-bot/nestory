import { createHash } from "node:crypto";

type OwnerStatementDownloadClient = {
  rpc(
    name: "get_owner_statement_artifact_download",
    args: { p_artifact_id: string; p_organization_id: string },
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  storage: {
    from(bucket: "owner-statements"): {
      download(path: string): PromiseLike<{
        data: Blob | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATEMENT_NUMBER = /^OS-[0-9]{6}-[0-9A-F]{12}$/;

export async function downloadOwnerStatementArtifact(
  client: OwnerStatementDownloadClient,
  organizationId: string,
  artifactId: string,
) {
  if (!UUID.test(organizationId) || !UUID.test(artifactId)) {
    throw new Error("Invalid Owner Statement artifact request.");
  }
  const metadata = await client.rpc("get_owner_statement_artifact_download", {
    p_artifact_id: artifactId,
    p_organization_id: organizationId,
  });
  if (metadata.error) throw new Error("Official Owner Statement artifact is unavailable.");

  const row = record(metadata.data);
  const format = row.format;
  const sha256 = row.sha256;
  const sizeBytes = row.size_bytes;
  const statementNumber = row.statement_number;
  const storagePath = row.storage_path;
  if (
    (format !== "pdf" && format !== "xlsx") ||
    typeof sha256 !== "string" || !SHA256.test(sha256) ||
    typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 ||
    typeof statementNumber !== "string" || !STATEMENT_NUMBER.test(statementNumber) ||
    typeof storagePath !== "string" || storagePath.length < 20
  ) {
    throw new Error("Invalid immutable Owner Statement artifact metadata.");
  }

  const stored = await client.storage.from("owner-statements").download(storagePath);
  if (stored.error || !stored.data) {
    throw new Error("Official Owner Statement artifact bytes are unavailable.");
  }
  const bytes = new Uint8Array(await stored.data.arrayBuffer());
  const downloadedHash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== sizeBytes || downloadedHash !== sha256) {
    throw new Error("Owner Statement artifact integrity verification failed.");
  }

  return {
    bytes,
    contentType: format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `owner-statement-${statementNumber}.${format}`,
    format,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid immutable Owner Statement artifact metadata.");
  }
  return value as Record<string, unknown>;
}
