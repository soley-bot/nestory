import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import {
  OWNER_BALANCE_COMPONENTS,
  type CanonicalOwnerBalanceAmount,
  type OwnerBalanceComponent,
} from "@/features/owner-balances/owner-balance.types";

export type OwnerStatementArtifactFormat = "pdf" | "xlsx";

export type OwnerStatementSource = {
  id: string;
  sourceFingerprint: string;
  sourceId: string;
  sourceLineId: string;
  sourceType: string;
};

export type OwnerStatementLine = {
  businessDate: string;
  component: OwnerBalanceComponent | null;
  description: string;
  id: string;
  lineKind: "activity" | "closing" | "movement" | "opening";
  lineNumber: number;
  signedAmount: CanonicalOwnerBalanceAmount;
  sourceCount: number;
  sources: OwnerStatementSource[];
};

export type OwnerStatementComponent = {
  closingAmount: CanonicalOwnerBalanceAmount;
  component: OwnerBalanceComponent;
  movementAmount: CanonicalOwnerBalanceAmount;
  openingAmount: CanonicalOwnerBalanceAmount;
};

export type OwnerStatementArtifact = {
  createdAt: string;
  createdBy: string;
  format: OwnerStatementArtifactFormat;
  id: string;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
};

export type OwnerStatementRevisionHistory = {
  closeContentHash: string;
  revisionId: string;
  revisionNumber: number;
  supersedesRevisionId: string | null;
};

export type OwnerStatementPublicationModel = {
  artifacts: OwnerStatementArtifact[];
  closeContentHash: string;
  closeReason: string;
  closedAt: string;
  closedBy: string;
  components: OwnerStatementComponent[];
  contentHash: string;
  currency: "USD";
  generatedAt: string;
  generatedBy: string;
  inputHash: string;
  lines: OwnerStatementLine[];
  monthStart: string;
  organizationId: string;
  ownerPersonId: string;
  propertyId: string;
  publicationId: string;
  revisionHistory: OwnerStatementRevisionHistory[];
  revisionId: string;
  revisionNumber: number;
  statementNumber: string;
  supersedesPublicationId: string | null;
  supersedesRevisionId: string | null;
};

type PublicationClient = {
  rpc(
    name: "get_owner_statement_publication",
    args: { p_organization_id: string; p_publication_id: string },
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const SHA256 = /^[0-9a-f]{64}$/;
const STATEMENT_NUMBER = /^OS-[0-9]{6}-[0-9A-F]{12}$/;
const LINE_KINDS = new Set(["activity", "closing", "movement", "opening"]);

export async function loadOwnerStatementPublication(
  client: PublicationClient,
  organizationId: string,
  publicationId: string,
) {
  const result = await client.rpc("get_owner_statement_publication", {
    p_organization_id: organizationId,
    p_publication_id: publicationId,
  });
  if (result.error) throw new Error("Unable to load official Owner Statement.");
  return mapOwnerStatementPublicationPayload(result.data);
}

export function mapOwnerStatementPublicationPayload(
  value: unknown,
): OwnerStatementPublicationModel {
  const row = record(value);
  if (!Array.isArray(row.lines) || !Array.isArray(row.components) ||
      !Array.isArray(row.revision_history) || !Array.isArray(row.artifacts)) {
    throw new Error("Invalid canonical Owner Statement payload.");
  }
  const lines = row.lines.map(mapLine);
  lines.forEach((line, index) => {
    if (line.lineNumber !== index + 1) {
      throw new Error("Owner Statement lines are not in strict frozen order.");
    }
  });
  const components = row.components.map(mapComponent);
  if (components.length !== OWNER_BALANCE_COMPONENTS.length ||
      components.some((item, index) => item.component !== OWNER_BALANCE_COMPONENTS[index])) {
    throw new Error("Owner Statement components are not in canonical order.");
  }
  const history = row.revision_history.map(mapHistory);
  history.forEach((item, index) => {
    if (item.revisionNumber !== index + 1) {
      throw new Error("Owner Statement revision history is not canonical.");
    }
  });
  const statementNumber = requiredString(row.statement_number);
  if (!STATEMENT_NUMBER.test(statementNumber)) {
    throw new Error("Invalid Owner Statement number.");
  }
  const currency = requiredString(row.currency);
  if (currency !== "USD") throw new Error("Unsupported Owner Statement currency.");

  return {
    artifacts: row.artifacts.map(mapArtifact).sort((a, b) => a.format.localeCompare(b.format)),
    closeContentHash: hash(row.close_content_hash),
    closeReason: requiredString(row.close_reason),
    closedAt: requiredString(row.closed_at),
    closedBy: requiredString(row.closed_by),
    components,
    contentHash: hash(row.content_hash),
    currency,
    generatedAt: requiredString(row.generated_at),
    generatedBy: requiredString(row.generated_by),
    inputHash: hash(row.input_hash),
    lines,
    monthStart: requiredString(row.month_start),
    organizationId: requiredString(row.organization_id),
    ownerPersonId: requiredString(row.owner_person_id),
    propertyId: requiredString(row.property_id),
    publicationId: requiredString(row.publication_id),
    revisionHistory: history,
    revisionId: requiredString(row.owner_close_revision_id),
    revisionNumber: positiveInteger(row.revision_number),
    statementNumber,
    supersedesPublicationId: nullableString(row.supersedes_publication_id),
    supersedesRevisionId: nullableString(row.supersedes_revision_id),
  };
}

function mapLine(value: unknown): OwnerStatementLine {
  const row = record(value);
  const kind = requiredString(row.line_kind);
  if (!LINE_KINDS.has(kind)) throw new Error("Invalid Owner Statement line kind.");
  const component = row.component === null ? null : requiredString(row.component);
  if (component !== null && !OWNER_BALANCE_COMPONENTS.includes(component as OwnerBalanceComponent)) {
    throw new Error("Invalid Owner Statement component.");
  }
  if ((kind === "activity") !== (component === null)) {
    throw new Error("Invalid Owner Statement activity component.");
  }
  if (!Array.isArray(row.sources)) throw new Error("Invalid Owner Statement sources.");
  const sources = row.sources.map(mapSource);
  sources.forEach((source, index) => {
    if (index === 0) return;
    const prior = sources[index - 1]!;
    const priorKey = `${prior.sourceType}|${prior.sourceLineId}|${prior.id}`;
    const key = `${source.sourceType}|${source.sourceLineId}|${source.id}`;
    if (priorKey >= key) throw new Error("Owner Statement sources are not in strict frozen order.");
  });
  const count = positiveInteger(row.source_count);
  if (count !== sources.length) throw new Error("Owner Statement source count mismatch.");
  return {
    businessDate: requiredString(row.business_date),
    component: component as OwnerBalanceComponent | null,
    description: requiredString(row.description),
    id: requiredString(row.id),
    lineKind: kind as OwnerStatementLine["lineKind"],
    lineNumber: positiveInteger(row.line_number),
    signedAmount: money(row.signed_amount),
    sourceCount: count,
    sources,
  };
}

function mapSource(value: unknown): OwnerStatementSource {
  const row = record(value);
  return {
    id: requiredString(row.id),
    sourceFingerprint: hash(row.source_fingerprint),
    sourceId: requiredString(row.source_id),
    sourceLineId: requiredString(row.source_line_id),
    sourceType: requiredString(row.source_type),
  };
}

function mapComponent(value: unknown): OwnerStatementComponent {
  const row = record(value);
  const component = requiredString(row.component);
  if (!OWNER_BALANCE_COMPONENTS.includes(component as OwnerBalanceComponent)) {
    throw new Error("Invalid Owner Statement component.");
  }
  return {
    closingAmount: money(row.closing_amount),
    component: component as OwnerBalanceComponent,
    movementAmount: money(row.movement_amount),
    openingAmount: money(row.opening_amount),
  };
}

function mapHistory(value: unknown): OwnerStatementRevisionHistory {
  const row = record(value);
  return {
    closeContentHash: hash(row.close_content_hash),
    revisionId: requiredString(row.owner_close_revision_id),
    revisionNumber: positiveInteger(row.revision_number),
    supersedesRevisionId: nullableString(row.supersedes_revision_id),
  };
}

function mapArtifact(value: unknown): OwnerStatementArtifact {
  const row = record(value);
  const format = requiredString(row.format);
  if (format !== "pdf" && format !== "xlsx") throw new Error("Invalid artifact format.");
  const sizeBytes = positiveInteger(row.size_bytes);
  return {
    createdAt: requiredString(row.created_at),
    createdBy: requiredString(row.created_by),
    format,
    id: requiredString(row.id),
    sha256: hash(row.sha256),
    sizeBytes,
    storagePath: requiredString(row.storage_path),
  };
}

function money(value: unknown): CanonicalOwnerBalanceAmount {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new Error("Owner Statement money must be a canonical decimal string.");
  }
  const canonical = canonicalizeSignedOwnerOpeningAmount(value);
  if (canonical !== value) {
    throw new Error("Owner Statement money must be a canonical decimal string.");
  }
  return canonical;
}

function hash(value: unknown) {
  const result = requiredString(value);
  if (!SHA256.test(result)) throw new Error("Invalid SHA-256 hash.");
  return result;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) throw new Error("Expected string.");
  return value;
}

function nullableString(value: unknown) {
  return value === null ? null : requiredString(value);
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Expected positive integer.");
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object.");
  }
  return value as Record<string, unknown>;
}
