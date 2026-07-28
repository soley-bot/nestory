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
  gt(column: string, value: string): ReportDocumentQuery;
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
  let afterId: string | null = null;

  while (expectedCount === null || documents.length < expectedCount) {
    let query = client
      .from("documents")
      .select(reportDocumentSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("id");
    if (afterId !== null) {
      query = query.gt("id", afterId);
    }
    const result = await query.range(0, reportSourceRangeEnd);

    if (result.error) {
      throw new Error(`Could not load report documents: ${result.error.message}`);
    }
    if (result.count === null) {
      throw new Error("Could not determine the exact report document count.");
    }

    if (expectedCount === null) {
      assertReportSourceWithinLimit("report documents", result.count);
      expectedCount = result.count;
    } else {
      const expectedRemaining = expectedCount - documents.length;
      if (result.count !== expectedRemaining) {
        throw new Error(
          `Report document population changed during collection: expected ${expectedRemaining.toLocaleString()} remaining rows, received ${result.count.toLocaleString()}.`,
        );
      }
    }

    const page = result.data ?? [];
    if (page.length === 0 && documents.length < expectedCount) {
      throw new Error(
        `Could not completely load report documents: expected ${expectedCount.toLocaleString()} rows, received ${documents.length.toLocaleString()}.`,
      );
    }
    if (
      page.some(
        (row, index) =>
          (afterId !== null && row.id <= afterId) ||
          (index > 0 && row.id <= page[index - 1].id),
      )
    ) {
      throw new Error(
        "Report document IDs were not strictly increasing during collection.",
      );
    }

    documents.push(...page);
    if (documents.length > expectedCount) {
      throw new Error(
        `Report document population changed during collection: expected ${expectedCount.toLocaleString()} rows, received at least ${documents.length.toLocaleString()}.`,
      );
    }
    afterId = page.at(-1)?.id ?? afterId;
  }

  return documents;
}
