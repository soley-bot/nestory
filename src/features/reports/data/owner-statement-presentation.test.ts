import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { loadOwnerStatementPresentation } from "@/features/reports/data/owner-statement-presentation";
import { mapOwnerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report";
import { ownerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report.test-fixture";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

describe("owner statement presentation", () => {
  it("loads human-readable scope and normalizes the private organization logo", async () => {
    const model = mapOwnerStatementPublicationPayload(
      structuredClone(ownerStatementPublicationPayload),
    );
    const jpeg = await sharp({
      create: {
        background: { alpha: 1, b: 36, g: 83, r: 20 },
        channels: 4,
        height: 128,
        width: 256,
      },
    }).jpeg().toBuffer();
    const client = fakeClient({
      logo: jpeg,
      organization: {
        logo_storage_path: `${model.organizationId}/logos/00000000-0000-4000-8000-000000000010.jpg`,
        name: "Independent Property Service",
      },
      owner: { display_name: "XIA YIXUAN" },
      property: { code: "PEAK", name: "The PEAK #2807" },
    });

    const presentation = await loadOwnerStatementPresentation(
      client as unknown as SupabaseClient<Database>,
      model,
    );

    expect(presentation.organizationName).toBe("Independent Property Service");
    expect(presentation.ownerName).toBe("XIA YIXUAN");
    expect(presentation.propertyLabel).toBe("PEAK / The PEAK #2807");
    expect(presentation.logo?.bytes[0]).toBe(0xff);
    expect(presentation.logo?.bytes[1]).toBe(0xd8);
    expect(presentation.logo?.width).toBeGreaterThan(0);
    expect(presentation.logo?.height).toBeGreaterThan(0);
  });
});

function fakeClient({
  logo,
  organization,
  owner,
  property,
}: {
  logo: Uint8Array;
  organization: { logo_storage_path: string | null; name: string };
  owner: { display_name: string };
  property: { code: string; name: string };
}) {
  const records: Record<string, unknown> = {
    organizations: organization,
    people: owner,
    properties: property,
  };
  return {
    from(table: string) {
      const builder = {
        eq() {
          return builder;
        },
        select() {
          return builder;
        },
        async single() {
          return { data: records[table], error: null };
        },
      };
      return builder;
    },
    storage: {
      from() {
        return {
          async download() {
            return {
              data: new Blob([new Uint8Array(logo)], { type: "image/jpeg" }),
              error: null,
            };
          },
        };
      },
    },
  };
}
