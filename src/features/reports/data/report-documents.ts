import {
  assertReportSourceWithinLimit,
  reportDocumentSelect,
  reportSourceRangeEnd,
} from "@/features/reports/data/report-source-completeness";

export type ReportDocumentRow = {
  file_name: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  property_id: string | null;
  timeline_event_id: string | null;
  unit_id: string | null;
};

type ReportDocumentResult = {
  count: number | null;
  data: ReportDocumentRow[] | null;
  error: { message: string } | null;
};

type ReportDocumentQuery = {
  eq(column: string, value: string): ReportDocumentQuery;
  is(column: string, value: null): ReportDocumentQuery;
  order(column: string): ReportDocumentQuery;
  range(from: number, to: number): PromiseLike<ReportDocumentResult>;
};

export type ReportDocumentClient = {
  from(relation: "documents"): {
    select(
      columns: string,
      options: { count: "exact" },
    ): ReportDocumentQuery;
  };
};

export async function loadReportDocuments(
  client: ReportDocumentClient,
  organizationId: string,
) {
  const documents: ReportDocumentRow[] = [];
  let expectedCount: number | null = null;

  while (expectedCount === null || documents.length < expectedCount) {
    const result = await client
      .from("documents")
      .select(reportDocumentSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("id")
      .range(documents.length, reportSourceRangeEnd);

    if (result.error) {
      throw new Error(`Could not load report documents: ${result.error.message}`);
    }
    if (result.count === null) {
      throw new Error("Could not determine the exact report document count.");
    }

    assertReportSourceWithinLimit("report documents", result.count);

    if (expectedCount !== null && result.count !== expectedCount) {
      throw new Error(
        `Report document count changed during collection: expected ${expectedCount.toLocaleString()}, received ${result.count.toLocaleString()}.`,
      );
    }

    expectedCount = result.count;
    const page = result.data ?? [];
    if (page.length === 0 && documents.length < expectedCount) {
      throw new Error(
        `Could not completely load report documents: expected ${expectedCount.toLocaleString()} rows, received ${documents.length.toLocaleString()}.`,
      );
    }
    documents.push(...page);
  }

  return documents;
}
