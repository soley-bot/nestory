import type { Database } from "@/types/database";

type UpdateDocumentArgs =
  Database["public"]["Functions"]["update_document"]["Args"];

type ExpectedUpdateDocumentKeys =
  | "p_category"
  | "p_document_id"
  | "p_lease_id"
  | "p_organization_id"
  | "p_property_id"
  | "p_task_id"
  | "p_unit_id";

type LegacyByteIdentityKeys = Extract<
  keyof UpdateDocumentArgs,
  "p_file_name" | "p_mime_type" | "p_size_bytes" | "p_storage_path"
>;

type AssertNever<T extends never> = T;
type AssertTrue<T extends true> = T;
type HasExactUpdateDocumentKeys =
  [keyof UpdateDocumentArgs] extends [ExpectedUpdateDocumentKeys]
    ? [ExpectedUpdateDocumentKeys] extends [keyof UpdateDocumentArgs]
      ? true
      : false
    : false;

export type UpdateDocumentRejectsLegacyByteIdentity =
  AssertNever<LegacyByteIdentityKeys>;
export type UpdateDocumentHasOnlyMetadataKeys =
  AssertTrue<HasExactUpdateDocumentKeys>;
