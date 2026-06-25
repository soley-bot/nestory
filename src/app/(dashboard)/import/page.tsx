import { ImportPreviewScreen } from "@/features/imports/components/import-preview-screen";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { requireAdminContext } from "@/lib/auth/context";

export default async function ImportPage() {
  const context = await requireAdminContext();
  const properties = await getPropertySummaries(context.organizationId);

  return (
    <ImportPreviewScreen
      propertyOptions={properties.map((property) => ({
        code: property.code,
        id: property.id,
        label: `${property.code} - ${property.name}`,
        name: property.name,
      }))}
    />
  );
}

