import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { loadOwnerStatementPresentation, loadReportCompanyLogo } from "@/features/reports/data/owner-statement-presentation";
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
    const reportLogo = await loadReportCompanyLogo(client as unknown as SupabaseClient<Database>, model.organizationId);
    expect(reportLogo?.bytes).toEqual(presentation.logo?.bytes);
  });

  it("preserves a transparent logo's full canvas and flattens its margins to white", async () => {
    const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
    const source = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect x="150" y="60" width="300" height="120" fill="#163d48"/></svg>')).png().toBuffer();
    const client = fakeClient({ logo: source, organization: { name: "Company", logo_storage_path: "fixture/logo.png" }, owner: { display_name: "Owner" }, property: { code: "P1", name: "Property" } });
    const presentation = await loadOwnerStatementPresentation(client as unknown as SupabaseClient<Database>, model);
    expect(presentation.logo).toMatchObject({ width: 600, height: 240 });
    const { data, info } = await sharp(presentation.logo!.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
    const center = (120 * info.width + 300) * info.channels;
    expect(data[center]).toBeLessThan(40);
    expect(data[center + 1]).toBeLessThan(80);
  });

  it("keeps a company without a logo free of image assets", async () => {
    const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
    const client = fakeClient({ logo: new Uint8Array(), organization: { name: "Company", logo_storage_path: null }, owner: { display_name: "Owner" }, property: { code: "P1", name: "Property" } });
    const presentation = await loadOwnerStatementPresentation(client as unknown as SupabaseClient<Database>, model);
    expect(presentation.logo).toBeUndefined();
    expect(presentation.organizationName).toBe("Company");
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
