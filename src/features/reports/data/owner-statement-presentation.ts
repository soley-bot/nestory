import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { OwnerStatementPresentation } from "@/features/reports/data/pdf";
import type { OwnerStatementPublicationModel } from "@/features/reports/data/owner-statement-report";

export async function loadOwnerStatementPresentation(
  client: SupabaseClient<Database>,
  model: OwnerStatementPublicationModel,
): Promise<OwnerStatementPresentation> {
  const [organization, property, owner] = await Promise.all([
    client
      .from("organizations")
      .select("name, logo_storage_path")
      .eq("id", model.organizationId)
      .single(),
    client
      .from("properties")
      .select("name, code")
      .eq("organization_id", model.organizationId)
      .eq("id", model.propertyId)
      .single(),
    client
      .from("people")
      .select("display_name")
      .eq("organization_id", model.organizationId)
      .eq("id", model.ownerPersonId)
      .single(),
  ]);
  if (organization.error || !organization.data) {
    throw new Error("Owner Statement company identity could not be loaded.");
  }
  if (property.error || !property.data) {
    throw new Error("Owner Statement property identity could not be loaded.");
  }
  if (owner.error || !owner.data) {
    throw new Error("Owner Statement owner identity could not be loaded.");
  }

  const logo = organization.data.logo_storage_path
    ? await loadPdfLogo(client, organization.data.logo_storage_path)
    : undefined;
  return {
    logo,
    organizationName: organization.data.name,
    ownerName: owner.data.display_name,
    propertyLabel: [property.data.code, property.data.name].filter(Boolean).join(" / "),
  };
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
