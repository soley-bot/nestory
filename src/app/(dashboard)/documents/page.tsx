import { DocumentScreen } from "@/features/documents/components/document-screen";
import { getDocumentsScreenData } from "@/features/documents/data/documents";
import { parseDocumentSearchParams } from "@/features/documents/document.filters";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type DocumentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parseDocumentSearchParams(params);
  const data = await getDocumentsScreenData(context.organizationId, viewQuery);
  const initialDocumentId = getUuidSearchParam(params.documentId);

  return (
    <DocumentScreen
      documents={data.documents}
      initialDocumentId={initialDocumentId}
      pagination={data.pagination}
      propertyOptions={data.propertyOptions}
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}
