import { describe, expect, it } from "vitest";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";
import { getPropertyPhotoThumbnailUrls, getUnitPhotoThumbnailUrls } from "./photos";

describe("complete thumbnail context", () => {
  it.each(["property", "unit"])("reads dense %s photos with bounded ID batches and deterministic cover precedence", async kind => {
    const ids = Array.from({ length: 76 }, (_, index) => `scope-${String(index).padStart(3, "0")}`);
    const photo = (index: number, scopeId: string) => ({
      id: `photo-${String(index).padStart(6, "0")}`, organization_id: "org1", archived_at: null,
      property_id: kind === "property" ? scopeId : "parent", unit_id: kind === "unit" ? scopeId : null,
      is_cover: false, uploaded_at: "2026-01-01", storage_path: `path-${index}`,
    });
    const photos = Array.from({ length: 1001 }, (_, index) => photo(index, ids[0]));
    photos.push(...ids.slice(1).map((scopeId, index) => ({ ...photo(index + 1001, scopeId), uploaded_at: "2025-01-01" })));
    photos.push({ ...photo(2000, ids[0]), is_cover: true, uploaded_at: "2024-01-01" });
    photos.push({ ...photo(2001, ids[0]), is_cover: true, uploaded_at: "2024-01-01" });
    photos.push({ ...photo(9999, ids[1]), organization_id: "other", is_cover: true });
    const { client, reads } = createCappedReadHarness({ asset_photos: photos }, { apiRowCap: 137 });
    const result = kind === "property"
      ? await getPropertyPhotoThumbnailUrls({ organizationId: "org1", propertyIds: ids, supabase: client as never })
      : await getUnitPhotoThumbnailUrls({ organizationId: "org1", unitIds: ids, supabase: client as never });
    expect(result.size).toBe(76);
    expect(result.get(ids[0])).toBe("https://synthetic.invalid/path-2000");
    expect(result.get(ids[1])).toBe("https://synthetic.invalid/path-1001");
    expect(result.get(ids[75])).toBe("https://synthetic.invalid/path-1075");
    expect(reads.every(read => read.filters.some(filter => filter.column === "organization_id" && filter.value === "org1"))).toBe(true);
    expect(reads.flatMap(read => read.filters.filter(filter => filter.method === "in")).every(filter => (filter.value as string[]).length <= 75)).toBe(true);
  });

  it("fails instead of silently treating an unavailable photo source as empty", async () => {
    const { client } = createCappedReadHarness({}, { transformResult: (_read, result) => ({ ...result, error: { message: 'relation "asset_photos" does not exist' } }) });
    await expect(getPropertyPhotoThumbnailUrls({ organizationId: "org1", propertyIds: ["property"], supabase: client as never })).rejects.toThrow("Could not load property photos");
  });
});
