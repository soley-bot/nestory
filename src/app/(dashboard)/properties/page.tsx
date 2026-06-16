import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { PropertiesTable } from "@/features/properties/components/properties-table";

export default function PropertiesPage() {
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
        <PropertiesTable />
      </div>
    </div>
  );
}
