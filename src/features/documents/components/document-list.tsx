import { ExternalLink, FileText } from "lucide-react";
import type { LinkedDocument } from "@/features/documents/document.types";
import { formatDate } from "@/lib/dates/format";

type DocumentListProps = {
  documents: LinkedDocument[];
  emptyLabel?: string;
};

export function DocumentList({
  documents,
  emptyLabel = "No documents attached yet.",
}: DocumentListProps) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {documents.map((document) => (
        <DocumentListItem document={document} key={document.id} />
      ))}
    </div>
  );
}

function DocumentListItem({ document }: { document: LinkedDocument }) {
  const content = (
    <>
      <span className="mt-0.5 text-muted">
        <FileText size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{document.fileName}</span>
        <span className="mt-1 block text-xs text-muted">
          {document.category} - {formatFileSize(document.sizeBytes)} -{" "}
          {formatDate(document.uploadedAt)}
        </span>
      </span>
      {document.url ? (
        <span className="text-muted">
          <ExternalLink size={14} />
        </span>
      ) : null}
    </>
  );

  if (document.url) {
    return (
      <a
        className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
        href={document.url}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
      {content}
    </div>
  );
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
