export const MAX_IMPORT_PAYLOAD_BYTES = 4 * 1024 * 1024;

export const IMPORT_PAYLOAD_SIZE_MESSAGE =
  "This import is too large to submit. Split the CSV into smaller files and try again.";

export function getImportPayloadError(payload: string): string | null {
  return new TextEncoder().encode(payload).byteLength > MAX_IMPORT_PAYLOAD_BYTES
    ? IMPORT_PAYLOAD_SIZE_MESSAGE
    : null;
}
