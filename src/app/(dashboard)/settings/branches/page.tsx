import type { Metadata } from "next";
import { OrganizationSettingsRoute } from "@/features/organization/components/organization-settings-route";

export default function BranchSettingsPage() {
  return <OrganizationSettingsRoute section="branches" />;
}

export const metadata: Metadata = { title: "Branches" };
