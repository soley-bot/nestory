import type {
  ImportMapping,
  ImportType,
  ParsedCsvRecord,
} from "@/features/imports/import.types";

type ImportDraftIdentityInput = {
  fileName: string;
  headers: string[];
  importType: ImportType;
  mapping: ImportMapping;
  records: ParsedCsvRecord[];
};

export function buildImportDraftKey(input: ImportDraftIdentityInput) {
  const content = JSON.stringify(input.records);

  return JSON.stringify({
    contentFingerprint: fingerprint(content),
    fileName: input.fileName,
    headers: input.headers,
    importType: input.importType,
    mapping: input.mapping,
    rowCount: input.records.length,
  });
}

function fingerprint(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return `${unsignedHex(first)}${unsignedHex(second)}`;
}

function unsignedHex(value: number) {
  return (value >>> 0).toString(16).padStart(8, "0");
}
