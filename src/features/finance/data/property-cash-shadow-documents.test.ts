import { describe, expect, it } from "vitest";

import {
  loadPropertyCashShadowDocuments,
  propertyCashShadowDocumentSelect,
} from "@/features/finance/data/property-cash-shadow-documents";
import { buildPropertyCashShadowMaterialStateToken } from "@/features/finance/data/property-cash-shadow-material";

type DocumentRow = {
  archived_at: string | null;
  file_name: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  organization_id: string;
  property_id: string | null;
  timeline_event_id: string | null;
  unit_id: string | null;
};

describe("property cash shadow document input", () => {
  it("loads one active organization-wide snapshot shared with trusted reports", async () => {
    const client = createDocumentClient([
      documentRow({ id: "selected", property_id: "property-a" }),
      documentRow({ id: "other", property_id: "property-b" }),
      documentRow({
        archived_at: "2026-07-01T00:00:00.000Z",
        id: "archived",
        property_id: "property-a",
      }),
      documentRow({
        id: "other-organization",
        organization_id: "organization-b",
      }),
    ]);

    const rows = await loadPropertyCashShadowDocuments({
      client: client as never,
      organizationId: "organization-a",
    });

    expect(rows.map((row) => row.id)).toEqual(["other", "selected"]);
    expect(client.requestedFunctions).toEqual([
      "get_report_documents_snapshot",
    ]);
    expect(client.requestedOrganizationIds).toEqual(["organization-a"]);
    expect(propertyCashShadowDocumentSelect).toBe(
      "id, property_id, unit_id, lease_id, ledger_entry_id, timeline_event_id, file_name",
    );
  });

  it("keeps organization document ordering and material tokens deterministic", async () => {
    const rows = [
      documentRow({
        file_name: "zeta.pdf",
        id: "document-z",
        property_id: "property-b",
      }),
      documentRow({
        file_name: "alpha.pdf",
        id: "document-a",
        property_id: "property-a",
      }),
    ];

    const first = await loadPropertyCashShadowDocuments({
      client: createDocumentClient(rows) as never,
      organizationId: "organization-a",
    });
    const second = await loadPropertyCashShadowDocuments({
      client: createDocumentClient([...rows].reverse()) as never,
      organizationId: "organization-a",
    });

    expect(first.map((row) => row.id)).toEqual([
      "document-a",
      "document-z",
    ]);
    expect(second).toEqual(first);
    expect(buildPropertyCashShadowMaterialStateToken(second)).toEqual(
      buildPropertyCashShadowMaterialStateToken(first),
    );

    const changed = first.map((row) =>
      row.id === "document-z"
        ? { ...row, file_name: "other-property-changed.pdf" }
        : row,
    );
    expect(buildPropertyCashShadowMaterialStateToken(changed).hash).not.toBe(
      buildPropertyCashShadowMaterialStateToken(first).hash,
    );
  });

  it("accepts exactly 5,000 active organization documents in one snapshot", async () => {
    const client = createDocumentClient(
      Array.from({ length: 5_000 }, (_, index) =>
        documentRow({ id: `document-${index.toString().padStart(5, "0")}` }),
      ),
    );

    await expect(
      loadPropertyCashShadowDocuments({
        client: client as never,
        organizationId: "organization-a",
      }),
    ).resolves.toHaveLength(5_000);
    expect(client.requestedFunctions).toHaveLength(1);
  });

  it("fails with trusted-report completeness semantics at 5,001 active organization documents", async () => {
    const client = createDocumentClient(
      Array.from({ length: 5_001 }, (_, index) =>
        documentRow({
          id: `document-${index.toString().padStart(5, "0")}`,
          property_id: index === 0 ? "property-a" : "property-b",
        }),
      ),
    );

    await expect(
      loadPropertyCashShadowDocuments({
        client: client as never,
        organizationId: "organization-a",
      }),
    ).rejects.toThrow(
      "report documents has 5,001 rows, which exceeds the 5,000 row report source limit. Narrow the report scope before exporting.",
    );
  });

  it("returns one consistent snapshot when the source changes after the statement", async () => {
    const rows = Array.from({ length: 2_000 }, (_, index) =>
      documentRow({ id: `document-${index.toString().padStart(5, "0")}` }),
    );
    const client = createDocumentClient(rows, {
      afterSnapshot(sourceRows) {
        sourceRows.shift();
        sourceRows.push(documentRow({ id: "document-z-new" }));
      },
    });

    const snapshot = await loadPropertyCashShadowDocuments({
      client: client as never,
      organizationId: "organization-a",
    });

    expect(snapshot).toHaveLength(2_000);
    expect(snapshot[0].id).toBe("document-00000");
    expect(snapshot.at(-1)?.id).toBe("document-01999");
    expect(snapshot.some((row) => row.id === "document-z-new")).toBe(false);
  });

  it("rejects a malformed snapshot payload", async () => {
    await expect(
      loadPropertyCashShadowDocuments({
        client: {
          rpc: async () => ({
            data: { count: 1, documents: [{ id: "missing-fields" }] },
            error: null,
          }),
        },
        organizationId: "organization-a",
      }),
    ).rejects.toThrow("Report document snapshot returned an invalid payload.");
  });
});

function documentRow(overrides: Partial<DocumentRow>): DocumentRow {
  return {
    archived_at: null,
    file_name: "document.pdf",
    id: "document",
    lease_id: null,
    ledger_entry_id: null,
    organization_id: "organization-a",
    property_id: "property-a",
    timeline_event_id: null,
    unit_id: null,
    ...overrides,
  };
}

function createDocumentClient(
  rows: DocumentRow[],
  options: {
    afterSnapshot?: (sourceRows: DocumentRow[]) => void;
  } = {},
) {
  const requestedFunctions: string[] = [];
  const requestedOrganizationIds: string[] = [];

  return {
    async rpc(
      functionName: string,
      arguments_: { p_organization_id: string },
    ) {
      requestedFunctions.push(functionName);
      requestedOrganizationIds.push(arguments_.p_organization_id);
      const activeRows = rows
        .filter(
          (row) =>
            row.organization_id === arguments_.p_organization_id &&
            row.archived_at === null,
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const data = {
        count: activeRows.length,
        documents: activeRows.slice(0, 5_001).map((row) => ({
          file_name: row.file_name,
          id: row.id,
          lease_id: row.lease_id,
          ledger_entry_id: row.ledger_entry_id,
          property_id: row.property_id,
          timeline_event_id: row.timeline_event_id,
          unit_id: row.unit_id,
        })),
      };
      options.afterSnapshot?.(rows);
      return { data, error: null };
    },
    requestedFunctions,
    requestedOrganizationIds,
  };
}
