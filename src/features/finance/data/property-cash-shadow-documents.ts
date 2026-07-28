import {
  assertCompleteReportSource,
  reportDocumentSelect,
  reportSourceRangeEnd,
} from "@/features/reports/data/report-source-completeness";

export const propertyCashShadowDocumentSelect = reportDocumentSelect;

type ShadowDocumentRow = {
  file_name: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  property_id: string | null;
  timeline_event_id: string | null;
  unit_id: string | null;
};

type ShadowDocumentResult = {
  count: number | null;
  data: ShadowDocumentRow[] | null;
  error: { message: string } | null;
};

type ShadowDocumentQuery = {
  eq(column: string, value: string): ShadowDocumentQuery;
  is(column: string, value: null): ShadowDocumentQuery;
  order(column: string): ShadowDocumentQuery;
  range(from: number, to: number): Promise<ShadowDocumentResult>;
};

type ShadowDocumentClient = {
  from(relation: "documents"): {
    select(
      columns: string,
      options: { count: "exact" },
    ): ShadowDocumentQuery;
  };
};

export async function loadPropertyCashShadowDocuments({
  client,
  organizationId,
}: {
  client: ShadowDocumentClient;
  organizationId: string;
}) {
  const result = await client
    .from("documents")
    .select(propertyCashShadowDocumentSelect, { count: "exact" })
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("id")
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(
      `Could not load report documents: ${result.error.message}`,
    );
  }

  assertCompleteReportSource("report documents", result);

  return result.data ?? [];
}
