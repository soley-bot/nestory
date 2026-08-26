export function documentDownloadUrl(documentId: string) {
  return `/api/documents/${encodeURIComponent(documentId)}`;
}

export function sanitizeAttachmentFilename(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]+/g, "-");
  const safe = ascii.replace(/[\\/:*?"<>|\r\n]/g, "-").trim().slice(0, 180);
  return safe.replace(/-/g, "").trim() ? safe : "document";
}
