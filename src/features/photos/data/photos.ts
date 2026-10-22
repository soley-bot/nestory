import { isMissingSchemaObjectMessage } from "@/lib/db/schema-errors";
import { createSupabaseServerClient } from "@/lib/db/server";
import { DEFAULT_COMPLETE_READ_MAX_ROWS, readCompleteRows } from "@/lib/db/complete-read";
import type { Tables } from "@/types/database";
import type { AssetPhoto } from "@/features/photos/photo.types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type AssetPhotoRow = Tables<"asset_photos">;
type AssetPhotoSelectRow = Pick<
  AssetPhotoRow,
  | "caption"
  | "file_name"
  | "id"
  | "is_cover"
  | "mime_type"
  | "property_id"
  | "size_bytes"
  | "storage_path"
  | "taken_at"
  | "unit_id"
  | "uploaded_at"
>;

const photoSelect =
  "id, property_id, unit_id, file_name, storage_path, mime_type, size_bytes, caption, is_cover, taken_at, uploaded_at";

export async function getAssetPhotosForScope({
  organizationId,
  propertyId,
  supabase,
  unitId,
}: {
  organizationId: string;
  propertyId: string;
  supabase: SupabaseServerClient;
  unitId?: string | null;
}) {
  let query = supabase
    .from("asset_photos")
    .select(photoSelect)
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .is("archived_at", null)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("uploaded_at", { ascending: false });

  if (unitId) {
    query = query.eq("unit_id", unitId);
  }

  const result = await query;

  if (result.error) {
    if (isMissingSchemaObjectMessage(result.error.message, ["asset_photos"])) {
      return [];
    }

    throw new Error(`Could not load photos: ${result.error.message}`);
  }

  return addSignedPhotoUrls(result.data ?? [], supabase);
}

export async function getPropertyPhotoThumbnailUrls({
  organizationId,
  propertyIds,
  supabase,
}: {
  organizationId: string;
  propertyIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (propertyIds.length === 0) {
    return new Map<string, string>();
  }

  const rows = await getCompleteThumbnailRows(supabase, organizationId, "property_id", propertyIds);

  return getThumbnailUrls({
    getScopeId: (row) => row.property_id,
    rows,
    supabase,
  });
}

export async function getUnitPhotoThumbnailUrls({
  organizationId,
  supabase,
  unitIds,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  unitIds: string[];
}) {
  if (unitIds.length === 0) {
    return new Map<string, string>();
  }

  const rows = await getCompleteThumbnailRows(supabase, organizationId, "unit_id", unitIds);

  return getThumbnailUrls({
    getScopeId: (row) => row.unit_id,
    rows,
    supabase,
  });
}

async function getCompleteThumbnailRows(
  supabase: SupabaseServerClient,
  organizationId: string,
  column: "property_id" | "unit_id",
  scopeIds: string[],
) {
  const rows: Pick<AssetPhotoRow, "id" | "property_id" | "unit_id" | "storage_path">[] = [];
  const ids = [...new Set(scopeIds)];
  for (let index = 0; index < ids.length; index += 75) {
    const batch = ids.slice(index, index + 75);
    const pageRows = await readCompleteRows<Pick<AssetPhotoRow, "id" | "property_id" | "unit_id" | "storage_path">>({
      maxRows: DEFAULT_COMPLETE_READ_MAX_ROWS - rows.length,
      context: `Could not load ${column === "property_id" ? "property" : "unit"} photos`,
      getRowId: row => row.id,
      readPage: (from, to) => {
        let query = supabase.from("asset_photos")
          .select("id, property_id, unit_id, storage_path, is_cover, uploaded_at", { count: "exact" })
          .eq("organization_id", organizationId)
          .in(column, batch)
          .is("archived_at", null);
        if (column === "property_id") query = query.is("unit_id", null);
        return query.order("is_cover", { ascending: false })
          .order("uploaded_at", { ascending: false })
          .order("id", { ascending: true }).range(from, to);
      },
    });
    rows.push(...pageRows);
  }
  return rows;
}

async function addSignedPhotoUrls(
  rows: AssetPhotoSelectRow[],
  supabase: SupabaseServerClient,
): Promise<AssetPhoto[]> {
  if (rows.length === 0) {
    return [];
  }

  const paths = rows.map((row) => row.storage_path);
  const { data } = await supabase.storage
    .from("nestory-photos")
    .createSignedUrls(paths, 60 * 60);
  const urlByPath = new Map<string, string>();

  paths.forEach((path, index) => {
    const signedUrl = data?.[index]?.signedUrl;

    if (signedUrl) {
      urlByPath.set(path, signedUrl);
    }
  });

  return rows.map((row) => ({
    caption: row.caption ?? undefined,
    fileName: row.file_name,
    id: row.id,
    isCover: row.is_cover,
    mimeType: row.mime_type,
    propertyId: row.property_id,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    takenAt: row.taken_at ?? undefined,
    unitId: row.unit_id ?? undefined,
    uploadedAt: row.uploaded_at,
    url: urlByPath.get(row.storage_path),
  }));
}

async function getThumbnailUrls<T extends { storage_path: string }>({
  getScopeId,
  rows,
  supabase,
}: {
  getScopeId: (row: T) => string | null;
  rows: T[];
  supabase: SupabaseServerClient;
}) {
  const firstPathByScope = new Map<string, string>();

  for (const row of rows) {
    const scopeId = getScopeId(row);

    if (scopeId && !firstPathByScope.has(scopeId)) {
      firstPathByScope.set(scopeId, row.storage_path);
    }
  }

  if (firstPathByScope.size === 0) {
    return new Map<string, string>();
  }

  const paths = [...firstPathByScope.values()];
  const { data } = await supabase.storage
    .from("nestory-photos")
    .createSignedUrls(paths, 60 * 60);
  const urlByPath = new Map<string, string>();

  paths.forEach((path, index) => {
    const signedUrl = data?.[index]?.signedUrl;

    if (signedUrl) {
      urlByPath.set(path, signedUrl);
    }
  });

  return new Map(
    [...firstPathByScope].flatMap(([scopeId, path]) => {
      const signedUrl = urlByPath.get(path);
      return signedUrl ? [[scopeId, signedUrl] as const] : [];
    }),
  );
}
