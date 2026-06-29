export function getSelectedDocument<T extends { id: string }>({
  documents,
  focusedDocumentId,
  selectedDocumentId,
}: {
  documents: T[];
  focusedDocumentId?: string;
  selectedDocumentId: string;
}): T | null {
  return (
    documents.find((document) => document.id === selectedDocumentId) ??
    (focusedDocumentId ? null : documents[0] ?? null)
  );
}
