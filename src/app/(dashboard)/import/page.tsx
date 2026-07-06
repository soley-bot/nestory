import { ImportPreviewScreen } from "@/features/imports/components/import-preview-screen";
import {
  getImportReferenceData,
  getImportSavedMappings,
  getRecentImportRuns,
} from "@/features/imports/data/imports";
import { requireAdminContext } from "@/lib/auth/context";

export default async function ImportPage() {
  const context = await requireAdminContext();
  const [referenceData, recentRuns, savedMappings] = await Promise.all([
    getImportReferenceData(context.organizationId),
    getRecentImportRuns(context.organizationId),
    getImportSavedMappings(context.organizationId),
  ]);

  return (
    <ImportPreviewScreen
      recentRuns={recentRuns}
      referenceData={referenceData}
      savedMappings={savedMappings}
    />
  );
}

