import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { OwnerStatementPresentation } from "@/features/reports/data/pdf";
import type { OwnerStatementPublicationModel } from "@/features/reports/data/owner-statement-report";
import { loadScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { loadStatementTransactionDetails } from "./owner-statement-transaction-details";

export async function loadOwnerStatementPresentation(
  client: SupabaseClient<Database>,
  model: OwnerStatementPublicationModel,
): Promise<OwnerStatementPresentation> {
  // Finance readers may not open property records. Reuse the checked finance
  // context, then select exact frozen identities from its authorized choices.
  const finance = await loadScopedFinanceContext(client, model.organizationId, model.propertyId);
  const property = finance.properties.find(row => row.id === model.propertyId);
  const owner = finance.people.find(row => row.id === model.ownerPersonId);
  if (!property) throw new Error("Owner Statement property identity could not be loaded.");
  if (!owner) throw new Error("Owner Statement owner identity could not be loaded.");
  const organization = await client
    .from("organizations")
    .select("name, logo_storage_path")
    .eq("id", model.organizationId)
    .single();
  if (organization.error || !organization.data) {
    throw new Error("Owner Statement company identity could not be loaded.");
  }

  const logo = organization.data.logo_storage_path
    ? await loadPdfLogo(client, organization.data.logo_storage_path)
    : undefined;
  return {
    logo,
    transactionDetails: await loadStatementTransactionDetails(client, model, { ownerName: owner.display_name, organizationName: organization.data.name }, finance),
    organizationName: organization.data.name,
    ownerName: owner.display_name,
    propertyLabel: [property.code, property.name].filter(Boolean).join(" / "),
  };
}

export async function loadReportCompanyLogo(client: SupabaseClient<Database>, organizationId: string) {
  const organization = await client.from("organizations").select("logo_storage_path").eq("id", organizationId).single();
  if (organization.error || !organization.data) throw new Error("Company logo settings could not be loaded.");
  return organization.data.logo_storage_path ? loadPdfLogo(client, organization.data.logo_storage_path) : undefined;
}

async function loadPdfLogo(
  client: SupabaseClient<Database>,
  storagePath: string,
) {
  const download = await client.storage
    .from("organization-assets")
    .download(storagePath);
  if (download.error || !download.data) {
    throw new Error("Owner Statement company logo could not be loaded.");
  }
  const source = Buffer.from(await download.data.arrayBuffer());
  const normalized = await sharp(source)
    .rotate()
    .resize({
      fit: "inside",
      height: 240,
      width: 600,
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ chromaSubsampling: "4:4:4", progressive: false, quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: new Uint8Array(
      normalized.data.buffer,
      normalized.data.byteOffset,
      normalized.data.byteLength,
    ),
    height: normalized.info.height,
    width: normalized.info.width,
  };
}
