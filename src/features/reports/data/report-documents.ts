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
  gte(column: string, value: string): ReportDocumentQuery;
  gt(column: string, value: string): ReportDocumentQuery;
  is(column: string, value: null): ReportDocumentQuery;
  lte(column: string, value: string): ReportDocumentQuery;
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

  await revalidateReportDocuments(client, organizationId, documents, expectedCount);
  return documents;
}

async function revalidateReportDocuments(
  client: ReportDocumentClient,
  organizationId: string,
  documents: ReportDocumentRow[],
  expectedCount: number,
) {
  const revalidationPageSize = 1_000;

  for (let offset = 0; offset < documents.length; offset += revalidationPageSize) {
    const expectedPage = documents.slice(offset, offset + revalidationPageSize);
    const firstId = expectedPage[0]?.id;
    const lastId = expectedPage.at(-1)?.id;
    if (firstId === undefined || lastId === undefined) {
      continue;
    }

    const result = await client
      .from("documents")
      .select(reportDocumentSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .gte("id", firstId)
      .lte("id", lastId)
      .order("id")
      .range(0, revalidationPageSize - 1);

    if (result.error) {
      throw new Error(
        `Could not revalidate report documents: ${result.error.message}`,
      );
    }
    const revalidatedPage = result.data ?? [];
    if (
      result.count !== expectedPage.length ||
      revalidatedPage.length !== expectedPage.length ||
      revalidatedPage.some(
        (row, index) => !sameReportDocument(row, expectedPage[index]),
      )
    ) {
      throw new Error(
        "Report document population changed during collection: a collected identity or value no longer matches the active organization-wide source.",
      );
    }
  }

  const finalCountResult = await client
    .from("documents")
    .select(reportDocumentSelect, { count: "exact" })
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("id")
    .range(0, 0);
  if (finalCountResult.error) {
    throw new Error(
      `Could not revalidate the report document count: ${finalCountResult.error.message}`,
    );
  }
  if (finalCountResult.count !== expectedCount) {
    throw new Error(
      `Report document population changed during collection: expected ${expectedCount.toLocaleString()} active rows, received ${String(finalCountResult.count)}.`,
    );
  }
}

function sameReportDocument(
  left: ReportDocumentRow,
  right: ReportDocumentRow | undefined,
) {
  return (
    right !== undefined &&
    left.id === right.id &&
    left.property_id === right.property_id &&
    left.unit_id === right.unit_id &&
    left.lease_id === right.lease_id &&
    left.ledger_entry_id === right.ledger_entry_id &&
    left.timeline_event_id === right.timeline_event_id &&
    left.file_name === right.file_name
  );
}
