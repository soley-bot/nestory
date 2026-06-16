import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { PropertiesTable } from "@/features/properties/components/properties-table";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { requireAdminContext } from "@/lib/auth/context";

export default async function PropertiesPage() {
  const context = await requireAdminContext();
  const properties = await getPropertySummaries(context.organizationId);

  return (
    <div>
      <PageHeader
        actions={
          <Button variant="primary">
            <Plus size={15} />
            Add property
          </Button>
        }
        description="Active property records with unit counts, ownership, and simple performance context."
        title="Properties"
      />
      <div className="p-8">
        <PropertiesTable properties={properties} />
      </div>
    </div>
  );
}
