import { DocumentScreen } from "@/features/documents/components/document-screen";
import { getDocumentsScreenData } from "@/features/documents/data/documents";
import { parseDocumentSearchParams } from "@/features/documents/document.filters";
import { requireSuperAdminContext } from "@/lib/auth/context";

type DocumentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const context = await requireSuperAdminContext();
  const params = await searchParams;
  const viewQuery = parseDocumentSearchParams(params);
  const data = await getDocumentsScreenData(context.organizationId, viewQuery);

  return (
    <DocumentScreen
      documents={data.documents}
      initialDocumentId={
        viewQuery.documentId === "all" ? undefined : viewQuery.documentId
      }
      pagination={data.pagination}
      propertyOptions={data.propertyOptions}
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}
