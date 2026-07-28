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
  it("loads the same active organization-wide document population as the trusted report", async () => {
    const client = createDocumentClient([
      documentRow({ id: "selected", property_id: "property-a" }),
      documentRow({ id: "other", property_id: "property-b" }),
      documentRow({
        archived_at: "2026-07-01T00:00:00.000Z",
        id: "archived",
        property_id: "property-a",
      }),
    ]);

    const rows = await loadPropertyCashShadowDocuments({
      client: client as never,
      organizationId: "organization-a",
    });

    expect(rows.map((row) => row.id)).toEqual(["other", "selected"]);
    expect(client.selectedColumns).toEqual(propertyCashShadowDocumentSelect);
    expect(client.requestedExactCount).toBe(true);
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

  it("accepts exactly 5,000 active organization documents", async () => {
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
    expect(client.requestedRanges).toEqual([
      [0, 4_999],
      [1_000, 4_999],
      [2_000, 4_999],
      [3_000, 4_999],
      [4_000, 4_999],
    ]);
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

function createDocumentClient(rows: DocumentRow[]) {
  const state = {
    filters: new Map<string, unknown>(),
    requestedExactCount: false,
    requestedRanges: [] as Array<[number, number]>,
    selectedColumns: "",
  };

  const query = {
    eq(column: string, value: string) {
      state.filters.set(column, value);
      return query;
    },
    is(column: string, value: null) {
      state.filters.set(column, value);
      return query;
    },
    order() {
      return query;
    },
    async range(from: number, to: number) {
      state.requestedRanges.push([from, to]);
      const filtered = rows
        .filter((row) =>
          [...state.filters].every(
            ([column, value]) =>
              row[column as keyof DocumentRow] === value,
          ),
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      return {
        count: state.requestedExactCount ? filtered.length : null,
        data: filtered.slice(from, Math.min(to + 1, from + 1_000)).map((row) => ({
          file_name: row.file_name,
          id: row.id,
          lease_id: row.lease_id,
          ledger_entry_id: row.ledger_entry_id,
          property_id: row.property_id,
          timeline_event_id: row.timeline_event_id,
          unit_id: row.unit_id,
        })),
        error: null,
      };
    },
  };

  return {
    from() {
      return {
        select(columns: string, options?: { count?: string }) {
          state.selectedColumns = columns;
          state.requestedExactCount = options?.count === "exact";
          return query;
        },
      };
    },
    get requestedExactCount() {
      return state.requestedExactCount;
    },
    get requestedRanges() {
      return state.requestedRanges;
    },
    get selectedColumns() {
      return state.selectedColumns;
    },
  };
}
