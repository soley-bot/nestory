import {
  assertCompleteReportSource,
  reportDocumentSelect,
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

type ReportDocumentSnapshotResult = {
  data: unknown;
  error: { message: string } | null;
};

export type ReportDocumentClient = {
  rpc(
    functionName: "get_report_documents_snapshot",
    arguments_: { p_organization_id: string },
  ): PromiseLike<ReportDocumentSnapshotResult>;
};

export async function loadReportDocuments(
  client: ReportDocumentClient,
  organizationId: string,
) {
  const result = await client.rpc("get_report_documents_snapshot", {
    p_organization_id: organizationId,
  });
  if (result.error) {
    throw new Error(`Could not load report documents: ${result.error.message}`);
  }

  const snapshot = parseReportDocumentSnapshot(result.data);
  assertCompleteReportSource("report documents", {
    count: snapshot.count,
    data: snapshot.documents,
  });

  if (
    snapshot.documents.some(
      (row, index) =>
        row.id.length === 0 ||
        (index > 0 && row.id <= snapshot.documents[index - 1].id),
    )
  ) {
    throw new Error(
      "Report document snapshot IDs were not strictly increasing.",
    );
  }

  return snapshot.documents;
}

function parseReportDocumentSnapshot(value: unknown): {
  count: number;
  documents: ReportDocumentRow[];
} {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.count) ||
    (value.count as number) < 0 ||
    !Array.isArray(value.documents) ||
    !value.documents.every(isReportDocumentRow)
  ) {
    throw new Error("Report document snapshot returned an invalid payload.");
  }

  return {
    count: value.count as number,
    documents: value.documents,
  };
}

function isReportDocumentRow(value: unknown): value is ReportDocumentRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.file_name === "string" &&
    isNullableString(value.property_id) &&
    isNullableString(value.unit_id) &&
    isNullableString(value.lease_id) &&
    isNullableString(value.ledger_entry_id) &&
    isNullableString(value.timeline_event_id)
  );
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { reportDocumentSelect };
