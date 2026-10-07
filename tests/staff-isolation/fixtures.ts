import { createHash } from "node:crypto";

export const companies = ["C1", "C2"] as const;
export const branches = ["A", "B"] as const;
export type Company = (typeof companies)[number];
export type Branch = (typeof branches)[number];

export function fixture(company: Company, branch: Branch) {
  const index = companies.indexOf(company) * 2 + branches.indexOf(branch) + 1;
  const organizationId = `10000000-0000-4000-8000-00000000000${companies.indexOf(company) + 1}`;
  const artifactId = `20000000-0000-4000-8000-00000000000${index}`;
  const propertyId = `30000000-0000-4000-8000-00000000000${index}`;
  const bytes = new TextEncoder().encode(`%PDF-synthetic-${company}-${branch}`);
  const storagePath = `${organizationId}/branches/${branch}/documents/${artifactId}.pdf`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    company, branch, organizationId, artifactId, propertyId, bytes, storagePath,
    userId: `synthetic-${company}-${branch}`,
    commercialMetadata: {
      source_kind: "invoice", document_number: `INV-${company}-${branch}`,
      storage_path: storagePath, sha256, size_bytes: bytes.byteLength,
      source_state: "issued", publication_status: "published", content_type: "application/pdf",
    },
    ownerMetadata: {
      artifact_id: artifactId, format: "pdf", statement_number: "OS-202610-000000000001",
      storage_path: storagePath, sha256, size_bytes: bytes.byteLength,
    },
  };
}

export const scopes = companies.flatMap((company) => branches.map((branch) => fixture(company, branch)));
