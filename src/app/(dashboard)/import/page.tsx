import { ImportPreviewScreen } from "@/features/imports/components/import-preview-screen";
import {
  getImportReferenceData,
  getImportSavedMappings,
  getRecentImportRuns,
} from "@/features/imports/data/imports";
import { getLatestIpsCutoverDetail } from "@/features/imports/data/cutover";
import { requireSuperAdminContext } from "@/lib/auth/context";

export default async function ImportPage() {
  const context = await requireSuperAdminContext();
  const [cutoverDetail, referenceData, recentRuns, savedMappings] = await Promise.all([
    getLatestIpsCutoverDetail(context.organizationId),
    getImportReferenceData(context.organizationId),
    getRecentImportRuns(context.organizationId),
    getImportSavedMappings(context.organizationId),
  ]);

  return (
    <ImportPreviewScreen
      cutoverDetail={cutoverDetail}
      recentRuns={recentRuns}
      referenceData={referenceData}
      savedMappings={savedMappings}
    />
  );
}

