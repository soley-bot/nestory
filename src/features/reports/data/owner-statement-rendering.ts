import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";
import { buildOwnerStatementXlsx } from "./excel";
import { buildOwnerStatementPdf, type OwnerStatementPresentation } from "./pdf";
import { loadOwnerStatementPresentation } from "./owner-statement-presentation";
import type { OwnerStatementPublicationModel } from "./owner-statement-report";

const snapshotSchema = z.object({
  rendererVersion: z.enum(["owner-statement-v1", "owner-statement-v2"]),
  presentation: z.object({
    organizationName: z.string().min(1),
    ownerName: z.string().min(1),
    propertyLabel: z.string().min(1),
    transactionDetails: z.record(z.string().regex(/^[1-9]\d*$/), z.object({
      unit: z.string().min(1),
      name: z.string(),
      category: z.string(),
    }).strict()),
    logo: z.object({
      base64: z.string().min(1),
      width: z.number().int().positive().max(600),
      height: z.number().int().positive().max(240),
    }).strict().nullable(),
  }).strict(),
}).strict();

export async function loadFrozenOwnerStatementPresentation(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  model: OwnerStatementPublicationModel,
  actorId: string,
): Promise<OwnerStatementPresentation & { rendererVersion: "owner-statement-v1" | "owner-statement-v2" }> {
  const scope = {
    p_actor_id: actorId,
    p_organization_id: model.organizationId,
    p_publication_id: model.publicationId,
  };
  const retained = await admin.rpc("get_owner_statement_rendering", scope);
  if (retained.error) throw new Error("Owner Statement frozen presentation could not be loaded.");
  if (retained.data !== null) return decodeSnapshot(retained.data);

  const presentation = await loadOwnerStatementPresentation(client, model);
  const snapshot = snapshotSchema.parse({
    rendererVersion: "owner-statement-v2",
    presentation: {
      ...presentation,
      transactionDetails: presentation.transactionDetails ?? {},
      logo: presentation.logo ? {
        base64: Buffer.from(presentation.logo.bytes).toString("base64"),
        width: presentation.logo.width,
        height: presentation.logo.height,
      } : null,
    },
  });
  await verifyLegacyArtifacts(admin, model, presentation);
  const frozen = await admin.rpc("freeze_owner_statement_rendering", {
    ...scope,
    p_snapshot: snapshot,
  });
  if (frozen.error) throw new Error("Owner Statement presentation could not be retained. Retry publication.");
  return decodeSnapshot(frozen.data);
}

function decodeSnapshot(value: unknown) {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw new Error("Owner Statement frozen presentation is invalid or unsupported.");
  const { logo, ...presentation } = result.data.presentation;
  const rendererVersion = result.data.rendererVersion;
  if (!logo) return { ...presentation, rendererVersion };
  const bytes = Buffer.from(logo.base64, "base64");
  if (bytes.toString("base64") !== logo.base64 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Owner Statement frozen logo is invalid.");
  }
  return { ...presentation, rendererVersion, logo: { bytes: new Uint8Array(bytes), width: logo.width, height: logo.height } };
}

async function verifyLegacyArtifacts(
  admin: SupabaseClient<Database>,
  model: OwnerStatementPublicationModel,
  presentation: OwnerStatementPresentation,
) {
  const candidates = [
    { format: "pdf", bytes: [buildOwnerStatementPdf(model, presentation)] },
    { format: "xlsx", bytes: [
      buildOwnerStatementXlsx(model, presentation),
      buildOwnerStatementXlsx(model, presentation, { headerLayout: "legacy" }),
      buildOwnerStatementXlsx(model, presentation, { headerLayout: "legacy", includeDepositSummary: true }),
    ] },
  ] as const;
  const bucket = admin.storage.from("owner-statements");
  for (const candidate of candidates) {
    const path = `${model.organizationId}/${model.publicationId}/${candidate.format}/owner-statement-${model.statementNumber}.${candidate.format}`;
    const registered = model.artifacts.find(artifact => artifact.format === candidate.format);
    const existing = await bucket.download(path);
    if (existing.error) {
      if (!registered && ["404", "NoSuchKey", "not_found"].includes(String(existing.error.statusCode))) continue;
      throw new Error("Existing Owner Statement artifact could not be verified before freezing presentation.");
    }
    if (!existing.data) throw new Error("Existing Owner Statement artifact bytes are unavailable.");
    const bytes = new Uint8Array(await existing.data.arrayBuffer());
    const hash = sha256(bytes);
    if (registered && (registered.storagePath !== path || registered.sha256 !== hash || registered.sizeBytes !== bytes.byteLength)) {
      throw new Error("Owner Statement artifact integrity verification failed.");
    }
    if (!candidate.bytes.some(expected => expected.byteLength === bytes.byteLength && sha256(expected) === hash)) {
      throw new Error("Existing Owner Statement branding or details have changed. Restore the original presentation before retrying publication.");
    }
  }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
