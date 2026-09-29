import { createSupabaseServerClient } from "@/lib/db/server";
import { preparePaidCostEvidence } from "./paid-cost-evidence";

export async function retainExpenseEvidence(input: {
  organizationId: string; actorId: string; transactionId: string;
  propertyId: string; idempotencyKey: string;
}) {
  const db = await createSupabaseServerClient();
  const original = await db.from("expense_transactions").select("supporting_document_id")
    .eq("organization_id", input.organizationId).eq("id", input.transactionId).single();
  if (original.error || !original.data) throw new Error("Original expense is unavailable.");
  if (!original.data.supporting_document_id) return null;
  const document = await db.from("documents").select("storage_path,file_name,mime_type")
    .eq("organization_id", input.organizationId).eq("id", original.data.supporting_document_id).single();
  if (document.error || !document.data) throw new Error("Original receipt is unavailable.");
  const stored = await db.storage.from("nestory-documents").download(document.data.storage_path);
  if (stored.error || !stored.data) throw new Error("Original receipt is unavailable.");
  const retained = await preparePaidCostEvidence({ ...input, requestClient: db,
    file: new File([stored.data], document.data.file_name, { type: document.data.mime_type }),
  });
  return retained.documentId;
}
