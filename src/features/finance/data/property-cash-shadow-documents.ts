import {
  loadReportDocuments,
  type ReportDocumentClient,
} from "@/features/reports/data/report-documents";
import { reportDocumentSelect } from "@/features/reports/data/report-source-completeness";

export const propertyCashShadowDocumentSelect = reportDocumentSelect;

export async function loadPropertyCashShadowDocuments({
  client,
  organizationId,
}: {
  client: ReportDocumentClient;
  organizationId: string;
}) {
  return loadReportDocuments(client, organizationId);
}
